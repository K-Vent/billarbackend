const express = require('express');
const router = express.Router();
const { z } = require('zod');

// Middlewares de Seguridad (IAM)
const { verificarSesion, soloAdmin } = require('../middlewares/auth.middleware');

// Prisma ORM
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

// ==========================================
// ESQUEMAS DE VALIDACIÓN
// ==========================================

/**
 * Esquema de validación para los gastos usando Zod.
 * @type {z.ZodObject}
 */
const gastoSchema = z.object({ 
    descripcion: z.string().min(1), 
    monto: z.coerce.number().positive() 
});

// ==========================================
// RUTAS OPERATIVAS DE CAJA Y FLUJO DE EFECTIVO
// ==========================================

/**
 * @route   POST /gastos/nuevo
 * @desc    Registra un nuevo gasto en la caja actual y guarda en la auditoría.
 * @access  Privado
 * @param   {Object} req - Objeto de petición HTTP.
 * @param   {Object} res - Objeto de respuesta HTTP.
 * @param   {Function} next - Middleware para el manejo de errores.
 * @returns {Object} Respuesta JSON con estado de éxito.
 */
router.post('/gastos/nuevo', verificarSesion, async (req, res, next) => { 
    try { 
        // Validamos el cuerpo de la petición con el esquema Zod
        const val = gastoSchema.parse(req.body); 
        
        // Transacción: Insertar gasto y auditar al mismo tiempo para mantener integridad
        await prisma.$transaction(async (tx) => {
            // Creamos el registro del gasto en la base de datos
            await tx.gastos.create({
                data: {
                    descripcion: val.descripcion,
                    monto: val.monto
                }
            });

            // Creamos el registro de auditoría asociado al gasto
            await tx.auditoria.create({
                data: {
                    usuario_id: req.usuario.id,
                    accion: 'NUEVO GASTO',
                    detalles: `Retiró S/ ${val.monto.toFixed(2)} de la caja. Motivo: ${val.descripcion}`
                }
            });
        });

        // Respondemos con éxito
        res.json({ success: true }); 
        
        // Notificamos a los clientes conectados vía WebSocket para actualizar la caja en tiempo real
        const io = req.app.get('socketio');
        if (io) io.emit('actualizar_caja'); 
    } catch (e) { 
        // Pasamos cualquier error al manejador de errores de Express
        next(e); 
    } 
});

/**
 * @route   GET /caja/actual
 * @desc    Obtiene los totales y el estado de la caja desde el último cierre.
 * @access  Privado
 * @param   {Object} req - Objeto de petición HTTP.
 * @param   {Object} res - Objeto de respuesta HTTP.
 * @param   {Function} next - Middleware para el manejo de errores.
 * @returns {Object} JSON con el balance de caja y listas de ventas/gastos.
 */
router.get('/caja/actual', verificarSesion, async (req, res, next) => {
    try { 
        // 1. Obtener la fecha exacta del último cierre
        const ultimoCierre = await prisma.cierres.findFirst({
            orderBy: { fecha_cierre: 'desc' }
        });
        
        // Determinamos la fecha desde donde filtrar: el último cierre o un valor muy antiguo
        const fechaFiltro = ultimoCierre && ultimoCierre.fecha_cierre 
            ? ultimoCierre.fecha_cierre 
            : new Date('2000-01-01T00:00:00Z');

        // 2. Prisma Aggregation: Agrupamos las consultas en promesas paralelas para mejor rendimiento
        const [ventasStats, gastosStats, listaVentas, listaGastos] = await Promise.all([
            // Agregamos métricas de ventas
            prisma.ventas.aggregate({
                _sum: {
                    total_final: true,
                    total_productos: true,
                    total_tiempo: true,
                    pago_efectivo: true,
                    pago_digital: true
                },
                _count: { id: true },
                where: { fecha: { gt: fechaFiltro } }
            }),
            // Agregamos métricas de gastos
            prisma.gastos.aggregate({
                _sum: { monto: true },
                where: { fecha: { gt: fechaFiltro } }
            }),
            // Obtenemos el listado detallado de ventas
            prisma.ventas.findMany({
                where: { fecha: { gt: fechaFiltro } },
                orderBy: { fecha: 'desc' }
            }),
            // Obtenemos el listado detallado de gastos
            prisma.gastos.findMany({
                where: { fecha: { gt: fechaFiltro } },
                orderBy: { fecha: 'desc' }
            })
        ]);

        // 3. Extracción segura de valores (evitando nulos) y conversión a número
        const total_ventas = Number(ventasStats._sum.total_final) || 0;
        const total_gastos = Number(gastosStats._sum.monto) || 0;
        const efectivo = Number(ventasStats._sum.pago_efectivo) || 0;
        const digital = Number(ventasStats._sum.pago_digital) || 0;

        // Respondemos con todos los datos calculados para la vista de la caja
        res.json({ 
            total_ventas: total_ventas, 
            total_gastos: total_gastos, 
            total_caja_real: total_ventas - total_gastos, 
            dinero_en_cajon: efectivo - total_gastos, 
            desglose: { 
                efectivo: efectivo, 
                digital: digital 
            }, 
            total_productos: Number(ventasStats._sum.total_productos) || 0, 
            total_mesas: Number(ventasStats._sum.total_tiempo) || 0, 
            // Formateamos la lista de ventas añadiendo la propiedad de 'hora'
            lista: listaVentas.map(v => ({
                ...v,
                // Formateamos la hora para mantener compatibilidad con el frontend
                hora: v.fecha.toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit', hour12: false })
            })),
            // Formateamos la lista de gastos añadiendo la propiedad de 'hora'
            listaGastos: listaGastos.map(g => ({
                ...g,
                hora: g.fecha.toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit', hour12: false })
            }))
        }); 
    } catch (e) { 
        // Pasamos el error al manejador correspondiente
        next(e); 
    }
});

/**
 * @route   POST /caja/cerrar
 * @desc    Cierra el turno de caja, calculando y registrando los totales, e incluye auditoría.
 * @access  Privado (Solo Admin)
 * @param   {Object} req - Objeto de petición HTTP.
 * @param   {Object} res - Objeto de respuesta HTTP.
 * @param   {Function} next - Middleware para el manejo de errores.
 * @returns {Object} JSON con estado de éxito, ventas totales y gastos.
 */
router.post('/caja/cerrar', verificarSesion, soloAdmin, async (req, res, next) => { 
    try { 
        // Obtenemos el registro del último cierre de caja
        const ultimoCierre = await prisma.cierres.findFirst({
            orderBy: { fecha_cierre: 'desc' }
        });
        
        // Establecemos el límite temporal para los cálculos del turno
        const fechaFiltro = ultimoCierre && ultimoCierre.fecha_cierre 
            ? ultimoCierre.fecha_cierre 
            : new Date('2000-01-01T00:00:00Z');

        // Obtenemos los totales del turno actual mediante consultas paralelas
        const [ventasStats, gastosStats] = await Promise.all([
            prisma.ventas.aggregate({
                _sum: { total_final: true },
                _count: { id: true },
                where: { fecha: { gt: fechaFiltro } }
            }),
            prisma.gastos.aggregate({
                _sum: { monto: true },
                where: { fecha: { gt: fechaFiltro } }
            })
        ]);
        
        // Convertimos de forma segura a números los resultados agregados
        const totalVentas = Number(ventasStats._sum.total_final) || 0; 
        const totalGastos = Number(gastosStats._sum.monto) || 0;
        const cantidadMesas = ventasStats._count.id || 0;

        // Ejecutamos el cierre y la auditoría en una transacción para mantener consistencia
        await prisma.$transaction([
            // Registramos el cierre con sus valores totales
            prisma.cierres.create({
                data: {
                    total_ventas: totalVentas,
                    total_gastos: totalGastos,
                    cantidad_mesas: cantidadMesas,
                    fecha_cierre: new Date()
                }
            }),
            // Insertamos la acción administrativa en el registro de auditoría
            prisma.auditoria.create({
                data: {
                    usuario_id: req.usuario.id,
                    accion: 'CIERRE DE CAJA',
                    detalles: `Ejecutó el cierre. Ventas: S/ ${totalVentas.toFixed(2)} | Gastos: S/ ${totalGastos.toFixed(2)}`
                }
            })
        ]);
        
        // Respondemos con los totales cerrados y un mensaje de éxito
        res.json({ success: true, total: totalVentas, gastos: totalGastos }); 
    } catch (e) { 
        // Pasamos el error al manejador
        next(e); 
    } 
});

/**
 * @route   DELETE /ventas/eliminar/:id
 * @desc    Elimina una venta por su identificador y registra el evento en auditoría.
 * @access  Privado (Solo Admin)
 * @param   {Object} req - Objeto de petición HTTP.
 * @param   {Object} res - Objeto de respuesta HTTP.
 * @param   {Function} next - Middleware para el manejo de errores.
 * @returns {Object} JSON confirmando la eliminación de la venta.
 */
router.delete('/ventas/eliminar/:id', verificarSesion, soloAdmin, async (req, res, next) => { 
    try { 
        // Parseamos y validamos el parámetro de la URL
        const id = z.coerce.number().int().parse(req.params.id);
        
        // Buscamos la venta en la base de datos para asegurarnos de que exista
        const ventaDb = await prisma.ventas.findUnique({
            where: { id: id }
        });

        // Si la venta no existe, retornamos un código 404
        if (!ventaDb) {
            return res.status(404).json({ error: 'Venta no encontrada.' });
        }

        // Transacción: Eliminar venta y auditar de forma atómica
        await prisma.$transaction([
            // Eliminamos el registro de la venta
            prisma.ventas.delete({
                where: { id: id }
            }),
            // Guardamos el registro de auditoría indicando qué venta se eliminó
            prisma.auditoria.create({
                data: {
                    usuario_id: req.usuario.id,
                    accion: 'ELIMINAR VENTA',
                    detalles: `Borró del sistema una venta de S/ ${Number(ventaDb.total_final).toFixed(2)}`
                }
            })
        ]);
        
        // Respondemos informando el éxito de la operación
        res.json({ success: true }); 
        
        // Notificamos vía WebSocket para actualizar las interfaces conectadas
        const io = req.app.get('socketio');
        if (io) io.emit('actualizar_caja'); 
    } catch (e) { 
        // Pasamos el error al middleware de Express
        next(e); 
    } 
});

module.exports = router;