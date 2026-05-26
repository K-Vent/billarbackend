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
const gastoSchema = z.object({ 
    descripcion: z.string().min(1), 
    monto: z.coerce.number().positive() 
});

// ==========================================
// RUTAS OPERATIVAS DE CAJA Y FLUJO DE EFECTIVO
// ==========================================

router.post('/gastos/nuevo', verificarSesion, async (req, res, next) => { 
    try { 
        const val = gastoSchema.parse(req.body); 
        
        // Transacción: Insertar gasto y auditar al mismo tiempo
        await prisma.$transaction(async (tx) => {
            await tx.gastos.create({
                data: {
                    descripcion: val.descripcion,
                    monto: val.monto
                }
            });

            await tx.auditoria.create({
                data: {
                    usuario_id: req.usuario.id,
                    accion: 'NUEVO GASTO',
                    detalles: `Retiró S/ ${val.monto.toFixed(2)} de la caja. Motivo: ${val.descripcion}`
                }
            });
        });

        res.json({ success: true }); 
        
        const io = req.app.get('socketio');
        if (io) io.emit('actualizar_caja'); 
    } catch (e) { next(e); } 
});

router.get('/caja/actual', verificarSesion, async (req, res, next) => {
    try { 
        // 1. Obtener la fecha exacta del último cierre
        const ultimoCierre = await prisma.cierres.findFirst({
            orderBy: { fecha_cierre: 'desc' }
        });
        
        const fechaFiltro = ultimoCierre && ultimoCierre.fecha_cierre 
            ? ultimoCierre.fecha_cierre 
            : new Date('2000-01-01T00:00:00Z');

        // 2. Prisma Aggregation: Agrupamos las consultas en promesas paralelas
        const [ventasStats, gastosStats, listaVentas, listaGastos] = await Promise.all([
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
            prisma.gastos.aggregate({
                _sum: { monto: true },
                where: { fecha: { gt: fechaFiltro } }
            }),
            prisma.ventas.findMany({
                where: { fecha: { gt: fechaFiltro } },
                orderBy: { fecha: 'desc' }
            }),
            prisma.gastos.findMany({
                where: { fecha: { gt: fechaFiltro } },
                orderBy: { fecha: 'desc' }
            })
        ]);

        // 3. Extracción segura de valores (evitando nulos)
        const total_ventas = Number(ventasStats._sum.total_final) || 0;
        const total_gastos = Number(gastosStats._sum.monto) || 0;
        const efectivo = Number(ventasStats._sum.pago_efectivo) || 0;
        const digital = Number(ventasStats._sum.pago_digital) || 0;

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
            lista: listaVentas.map(v => ({
                ...v,
                // Formateamos la hora para mantener compatibilidad con tu frontend
                hora: v.fecha.toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit', hour12: false })
            })),
            listaGastos: listaGastos.map(g => ({
                ...g,
                hora: g.fecha.toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit', hour12: false })
            }))
        }); 
    } catch (e) { next(e); }
});

router.post('/caja/cerrar', verificarSesion, soloAdmin, async (req, res, next) => { 
    try { 
        const ultimoCierre = await prisma.cierres.findFirst({
            orderBy: { fecha_cierre: 'desc' }
        });
        
        const fechaFiltro = ultimoCierre && ultimoCierre.fecha_cierre 
            ? ultimoCierre.fecha_cierre 
            : new Date('2000-01-01T00:00:00Z');

        // Obtenemos los totales del turno actual
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
        
        const totalVentas = Number(ventasStats._sum.total_final) || 0; 
        const totalGastos = Number(gastosStats._sum.monto) || 0;
        const cantidadMesas = ventasStats._count.id || 0;

        // Ejecutamos el cierre y la auditoría
        await prisma.$transaction([
            prisma.cierres.create({
                data: {
                    total_ventas: totalVentas,
                    total_gastos: totalGastos,
                    cantidad_mesas: cantidadMesas,
                    fecha_cierre: new Date()
                }
            }),
            prisma.auditoria.create({
                data: {
                    usuario_id: req.usuario.id,
                    accion: 'CIERRE DE CAJA',
                    detalles: `Ejecutó el cierre. Ventas: S/ ${totalVentas.toFixed(2)} | Gastos: S/ ${totalGastos.toFixed(2)}`
                }
            })
        ]);
        
        res.json({ success: true, total: totalVentas, gastos: totalGastos }); 
    } catch (e) { next(e); } 
});

router.delete('/ventas/eliminar/:id', verificarSesion, soloAdmin, async (req, res, next) => { 
    try { 
        const id = z.coerce.number().int().parse(req.params.id);
        
        const ventaDb = await prisma.ventas.findUnique({
            where: { id: id }
        });

        if (!ventaDb) {
            return res.status(404).json({ error: 'Venta no encontrada.' });
        }

        // Transacción: Eliminar y auditar
        await prisma.$transaction([
            prisma.ventas.delete({
                where: { id: id }
            }),
            prisma.auditoria.create({
                data: {
                    usuario_id: req.usuario.id,
                    accion: 'ELIMINAR VENTA',
                    detalles: `Borró del sistema una venta de S/ ${Number(ventaDb.total_final).toFixed(2)}`
                }
            })
        ]);
        
        res.json({ success: true }); 
        
        const io = req.app.get('socketio');
        if (io) io.emit('actualizar_caja'); 
    } catch (e) { next(e); } 
});

module.exports = router;