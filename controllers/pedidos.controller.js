const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const { z } = require('zod');

// Esquema de Validación Estricta
const pedidoSchema = z.object({ 
    mesa_id: z.coerce.number().int().positive(), 
    producto_id: z.coerce.number().int().positive(), 
    cantidad: z.coerce.number().int().positive(),
    cliente_nombre: z.string().optional() 
});

// ==========================================
// CONTROLADOR DE PEDIDOS (POS & KDS)
// ==========================================

const obtenerPedidosPendientes = async (req, res, next) => { 
    try { 
        // Prisma: Equivalente al JOIN de mesas y productos filtrando por estado
        const pedidosDb = await prisma.pedidos_mesa.findMany({
            where: { 
                pagado: false, 
                // Manejo de valores nulos o falsos
                OR: [
                    { entregado: false },
                    { entregado: null }
                ]
            },
            include: {
                mesas: { select: { numero_mesa: true } },
                productos: { select: { nombre: true, categoria: true } }
            },
            orderBy: { fecha_creacion: 'asc' }
        });

        // Formateo de la respuesta para el frontend (Extracción de hora y aplanamiento del JSON)
        const pedidosFormateados = pedidosDb.map(pm => {
            const fecha = pm.fecha_creacion || new Date();
            const horaFormateada = fecha.toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit', hour12: false });
            
            return {
                id: pm.id,
                numero_mesa: pm.mesas ? pm.mesas.numero_mesa : 'N/A',
                nombre: pm.productos ? pm.productos.nombre : 'Producto Eliminado',
                cantidad: pm.cantidad,
                categoria: pm.productos ? pm.productos.categoria : 'General',
                hora: horaFormateada
            };
        });

        res.json(pedidosFormateados); 
    } catch (e) { next(e); } 
};

const marcarEntregado = async (req, res, next) => { 
    try { 
        const id = z.coerce.number().int().parse(req.params.id); 
        
        await prisma.pedidos_mesa.update({
            where: { id: id },
            data: { entregado: true }
        });
        
        res.json({ success: true }); 
        
        const io = req.app.get('socketio');
        if (io) io.emit('actualizar_cocina'); // Refresca el KDS silenciosamente
    } catch (e) { next(e); } 
};

const crearPedido = async (req, res, next) => { 
    try { 
        const val = pedidoSchema.parse(req.body); 
        
        // Regla de Negocio: Normalización del nombre del cliente
        const cliente = req.body.cliente_nombre && req.body.cliente_nombre.trim() !== '' 
            ? req.body.cliente_nombre.trim().toUpperCase() 
            : 'General';

        // Ejecución de la lógica en una sola transacción segura
        await prisma.$transaction(async (tx) => {
            // 1. Insertamos el pedido
            await tx.pedidos_mesa.create({
                data: {
                    mesa_id: val.mesa_id,
                    producto_id: val.producto_id,
                    cantidad: val.cantidad,
                    fecha_creacion: new Date(),
                    entregado: false,
                    cliente_nombre: cliente
                }
            });

            // 2. Descontamos el stock
            const productoActualizado = await tx.productos.update({
                where: { id: val.producto_id },
                data: { stock: { decrement: val.cantidad } },
                select: { nombre: true, stock: true, categoria: true }
            });

            // 3. Obtenemos la mesa para la auditoría
            const mesaDb = await tx.mesas.findUnique({
                where: { id: val.mesa_id },
                select: { numero_mesa: true }
            });

            // 4. Registramos en la bitácora
            await tx.auditoria.create({
                data: {
                    usuario_id: req.usuario.id,
                    accion: 'NUEVO PEDIDO',
                    detalles: `Añadió ${val.cantidad}x ${productoActualizado.nombre} a Mesa ${mesaDb.numero_mesa} (Cuenta: ${cliente})`
                }
            });
        });

        res.json({ success: true }); 
        
        // Emisión de alertas al ecosistema
        const io = req.app.get('socketio');
        if (io) {
            io.emit('actualizar_mesas'); 
            io.emit('campana_cocina'); // Alerta sonora/visual para el KDS
        }
    } catch (e) { next(e); } 
};

const eliminarPedido = async (req, res, next) => { 
    try { 
        const id = z.coerce.number().int().parse(req.params.id); 
        
        const pedido = await prisma.pedidos_mesa.findUnique({
            where: { id: id },
            select: { producto_id: true, cantidad: true }
        });

        if (pedido) { 
            // Transacción inversa: Devolvemos el stock y eliminamos el registro
            await prisma.$transaction([
                prisma.productos.update({
                    where: { id: pedido.producto_id },
                    data: { stock: { increment: pedido.cantidad } }
                }),
                prisma.pedidos_mesa.delete({
                    where: { id: id }
                })
            ]);
        } 
        
        res.json({ success: true }); 
        
        const io = req.app.get('socketio');
        if (io) {
            io.emit('actualizar_mesas'); 
            io.emit('actualizar_cocina'); 
        }
    } catch (e) { next(e); } 
};

module.exports = {
    obtenerPedidosPendientes,
    marcarEntregado,
    crearPedido,
    eliminarPedido
};