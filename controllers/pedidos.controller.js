const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const { z } = require('zod');

/**
 * Esquema de validación estricta para la creación de un nuevo pedido.
 * Utiliza Zod para garantizar los tipos de datos correctos antes de insertarlos en la base de datos.
 * @constant {z.ZodObject}
 */
const pedidoSchema = z.object({ 
    mesa_id: z.coerce.number().int().positive(), 
    producto_id: z.coerce.number().int().positive(), 
    cantidad: z.coerce.number().int().positive(),
    cliente_nombre: z.string().optional() 
});

// ==========================================
// CONTROLADOR DE PEDIDOS (POS & KDS)
// ==========================================

/**
 * Obtiene la lista de todos los pedidos pendientes para el Kitchen Display System (KDS).
 * Filtra los pedidos que no han sido pagados y que no han sido entregados.
 * 
 * @async
 * @function obtenerPedidosPendientes
 * @param {import('express').Request} req - El objeto de solicitud de Express.
 * @param {import('express').Response} res - El objeto de respuesta de Express.
 * @param {import('express').NextFunction} next - La función middleware siguiente de Express para manejo de errores.
 * @returns {Promise<void>} - Devuelve una respuesta JSON con la lista de pedidos formateados.
 */
const obtenerPedidosPendientes = async (req, res, next) => { 
    try { 
        // Prisma: Equivalente al JOIN de mesas y productos filtrando por estado
        // Buscamos todos los pedidos de mesa donde 'pagado' es falso y 'entregado' es falso o nulo.
        const pedidosDb = await prisma.pedidos_mesa.findMany({
            where: { 
                pagado: false, 
                // Manejo de valores nulos o falsos para asegurar compatibilidad
                OR: [
                    { entregado: false },
                    { entregado: null }
                ]
            },
            include: {
                // Incluimos las relaciones para obtener detalles legibles de mesa y producto
                mesas: { select: { numero_mesa: true } },
                productos: { select: { nombre: true, categoria: true } }
            },
            orderBy: { fecha_creacion: 'asc' } // Ordenamos por fecha ascendente (el más antiguo primero)
        });

        // Formateo de la respuesta para el frontend (Extracción de hora y aplanamiento del JSON)
        // Convertimos el modelo anidado de Prisma en un array de objetos planos para facilitar su renderizado en la interfaz.
        const pedidosFormateados = pedidosDb.map(pm => {
            const fecha = pm.fecha_creacion || new Date();
            // Formateamos la hora en formato 24h para mostrar de manera uniforme
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

        // Retornamos los pedidos formateados
        res.json(pedidosFormateados); 
    } catch (e) { next(e); } 
};

/**
 * Marca un pedido específico como "entregado" en la base de datos.
 * Utilizado por el personal de cocina cuando despachan el pedido.
 * 
 * @async
 * @function marcarEntregado
 * @param {import('express').Request} req - El objeto de solicitud de Express. Contiene 'id' en req.params.
 * @param {import('express').Response} res - El objeto de respuesta de Express.
 * @param {import('express').NextFunction} next - La función middleware siguiente de Express para manejo de errores.
 * @returns {Promise<void>} - Devuelve una respuesta JSON confirmando la operación.
 */
const marcarEntregado = async (req, res, next) => { 
    try { 
        // Validamos y convertimos el parámetro id a entero usando Zod
        const id = z.coerce.number().int().parse(req.params.id); 
        
        // Actualizamos el registro del pedido marcándolo como entregado
        await prisma.pedidos_mesa.update({
            where: { id: id },
            data: { entregado: true }
        });
        
        // Respondemos con éxito al cliente
        res.json({ success: true }); 
        
        // Emitimos un evento a todos los clientes conectados a través de WebSocket
        const io = req.app.get('socketio');
        if (io) io.emit('actualizar_cocina'); // Refresca el KDS silenciosamente
    } catch (e) { next(e); } 
};

/**
 * Crea un nuevo pedido asociado a una mesa específica, descuenta el stock correspondiente y registra en la auditoría.
 * Ejecuta todas las operaciones dentro de una transacción para garantizar integridad.
 * 
 * @async
 * @function crearPedido
 * @param {import('express').Request} req - El objeto de solicitud de Express. Contiene los datos del pedido en req.body.
 * @param {import('express').Response} res - El objeto de respuesta de Express.
 * @param {import('express').NextFunction} next - La función middleware siguiente de Express para manejo de errores.
 * @returns {Promise<void>} - Devuelve una respuesta JSON confirmando la creación exitosa del pedido.
 */
const crearPedido = async (req, res, next) => { 
    try { 
        // Validamos el cuerpo de la petición contra el esquema definido
        const val = pedidoSchema.parse(req.body); 
        
        // Regla de Negocio: Normalización del nombre del cliente
        // Convertimos a mayúsculas y quitamos espacios; si no se provee un nombre, asignamos 'General'
        const cliente = req.body.cliente_nombre && req.body.cliente_nombre.trim() !== '' 
            ? req.body.cliente_nombre.trim().toUpperCase() 
            : 'General';

        // Ejecución de la lógica en una sola transacción segura
        // Esto previene que se inserte un pedido si falla el descuento de stock (o viceversa)
        await prisma.$transaction(async (tx) => {
            // 1. Insertamos el pedido en la tabla 'pedidos_mesa'
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

            // 2. Descontamos el stock del producto vendido y obtenemos sus datos
            const productoActualizado = await tx.productos.update({
                where: { id: val.producto_id },
                data: { stock: { decrement: val.cantidad } },
                select: { nombre: true, stock: true, categoria: true }
            });

            // 3. Obtenemos la mesa asociada para el mensaje de la auditoría
            const mesaDb = await tx.mesas.findUnique({
                where: { id: val.mesa_id },
                select: { numero_mesa: true }
            });

            // 4. Registramos en la bitácora (auditoría) el evento de nuevo pedido
            await tx.auditoria.create({
                data: {
                    // El usuario se extrae del middleware de autenticación (req.usuario)
                    usuario_id: req.usuario.id,
                    accion: 'NUEVO PEDIDO',
                    detalles: `Añadió ${val.cantidad}x ${productoActualizado.nombre} a Mesa ${mesaDb.numero_mesa} (Cuenta: ${cliente})`
                }
            });
        });

        // Respondemos con éxito al cliente
        res.json({ success: true }); 
        
        // Emisión de alertas al ecosistema a través de WebSocket
        const io = req.app.get('socketio');
        if (io) {
            io.emit('actualizar_mesas'); // Actualiza el estado visual de las mesas en el POS
            io.emit('campana_cocina'); // Alerta sonora/visual para el KDS (Kitchen Display System)
        }
    } catch (e) { next(e); } 
};

/**
 * Elimina un pedido previamente creado. Devuelve el stock al producto 
 * y notifica en tiempo real los cambios al ecosistema.
 * 
 * @async
 * @function eliminarPedido
 * @param {import('express').Request} req - El objeto de solicitud de Express. Contiene 'id' en req.params.
 * @param {import('express').Response} res - El objeto de respuesta de Express.
 * @param {import('express').NextFunction} next - La función middleware siguiente de Express para manejo de errores.
 * @returns {Promise<void>} - Devuelve una respuesta JSON indicando el éxito de la eliminación.
 */
const eliminarPedido = async (req, res, next) => { 
    try { 
        // Validamos el parámetro id usando Zod
        const id = z.coerce.number().int().parse(req.params.id); 
        
        // Buscamos el pedido en la base de datos para obtener el producto_id y la cantidad
        // Esto es necesario para devolver el stock correctamente antes de eliminar
        const pedido = await prisma.pedidos_mesa.findUnique({
            where: { id: id },
            select: { producto_id: true, cantidad: true }
        });

        // Si el pedido existe, procedemos con la eliminación y restauración de stock
        if (pedido) { 
            // Transacción inversa: Devolvemos el stock al producto y eliminamos el registro del pedido de forma atómica
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
        
        // Respondemos exitosamente
        res.json({ success: true }); 
        
        // Emitimos eventos para actualizar la interfaz gráfica de otros clientes
        const io = req.app.get('socketio');
        if (io) {
            io.emit('actualizar_mesas'); // Actualiza POS
            io.emit('actualizar_cocina'); // Actualiza KDS
        }
    } catch (e) { next(e); } 
};

module.exports = {
    obtenerPedidosPendientes,
    marcarEntregado,
    crearPedido,
    eliminarPedido
};