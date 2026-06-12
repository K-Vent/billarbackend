const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const { z } = require('zod');

// ==========================================
// 1. ESQUEMAS DE VALIDACIÓN (ZOD) - (Intactos)
// ==========================================

/**
 * Esquema de validación para la apertura de una mesa.
 * @type {z.ZodObject}
 */
const abrirMesaSchema = z.object({
    minutos: z.number().int().min(0)
});

/**
 * Esquema de validación para el cierre de una mesa.
 * @type {z.ZodObject}
 */
const cerrarMesaSchema = z.object({
    metodo: z.enum(['EFECTIVO', 'DIGITAL', 'MIXTO']),
    pago_efectivo: z.number().optional(),
    pago_digital: z.number().optional(),
    id_socio_vip: z.number().int().optional()
});

/**
 * Esquema de validación para el cambio o traslado de mesa.
 * @type {z.ZodObject}
 */
const cambiarMesaSchema = z.object({
    idOrigen: z.number().int(),
    idDestino: z.number().int()
});

// ==========================================
// 2. FUNCIONES AUXILIARES (Intactas)
// ==========================================

/**
 * Objeto en caché para almacenar el precio por hora del billar 
 * y evitar consultas excesivas a la base de datos.
 * @type {{precio_billar: number, ultimaActualizacion: number}}
 */
let configCache = { precio_billar: 10, ultimaActualizacion: 0 };

/**
 * Obtiene el precio por hora del billar desde la base de datos.
 * Utiliza una caché de 60 segundos para optimizar el rendimiento.
 * 
 * @async
 * @returns {Promise<number>} El precio por hora del billar.
 */
async function getPrecioBillar() {
    const ahora = Date.now();
    // Cache de 60 segundos para no saturar la DB y mejorar la latencia
    if (ahora - configCache.ultimaActualizacion > 60000) {
        try {
            // Consulta a la tabla de configuración buscando la clave específica
            const config = await prisma.config.findUnique({
                where: { clave: 'PRECIO_HORA_BILLAR' }
            });
            // Si la configuración existe y tiene valor, se actualiza la caché local
            if (config && config.valor) {
                configCache.precio_billar = parseFloat(config.valor);
            }
            // Se actualiza el tiempo de la última consulta a la DB
            configCache.ultimaActualizacion = ahora;
        } catch (e) {
            console.error("Error al obtener precio de billar:", e);
        }
    }
    return configCache.precio_billar;
}

/**
 * Calcula el costo total del tiempo de juego en una mesa de billar.
 * 
 * @param {number} minutosTotales - Cantidad total de minutos jugados.
 * @param {number} precioHora - Precio por hora del billar.
 * @returns {number} Costo calculado basado en bloques de media hora.
 */
function calcularCostoBillar(minutosTotales, precioHora) {
    const precioMediaHora = precioHora / 2;
    // Periodo de gracia de 5 minutos, si es menor o igual, el costo es cero
    if (minutosTotales <= 5) return 0; 
    // Se cobran bloques completos de 30 minutos una vez pasado el periodo de gracia
    const bloquesACobrar = Math.ceil((minutosTotales - 5) / 30);
    return bloquesACobrar * precioMediaHora;
}

// ==========================================
// 3. CONTROLADORES (Refactorizados a Prisma)
// ==========================================

/**
 * Obtiene la lista completa de mesas registradas en el sistema.
 * Agrega el tiempo de uso en segundos para las mesas de billar ocupadas.
 * 
 * @async
 * @param {Object} req - Objeto de petición Express.
 * @param {Object} res - Objeto de respuesta Express.
 * @param {Function} next - Middleware para el manejo de errores.
 * @returns {Promise<void>} 
 */
const obtenerMesas = async (req, res, next) => { 
    try { 
        const precio = await getPrecioBillar(); 
        
        // 🔥 Prisma: Búsqueda ordenada simple por número de mesa
        const mesasDb = await prisma.mesas.findMany({
            orderBy: { numero_mesa: 'asc' }
        });
        
        const now = new Date(); // Obtenemos la hora actual en JS
        
        const mesas = mesasDb.map(m => { 
            // 🔥 Adiós EXTRACT(EPOCH). Matemática pura y rápida en Node.js
            let segundos = 0;
            // Solo calculamos el tiempo transcurrido si la mesa es de billar, está ocupada y tiene hora de inicio
            if (m.estado === 'OCUPADA' && m.tipo === 'BILLAR' && m.hora_inicio) {
                segundos = Math.floor((now - new Date(m.hora_inicio)) / 1000);
            }

            return { 
                ...m, 
                precio_hora: precio, 
                segundos: segundos 
            };
        }); 
        
        res.json(mesas); 
    } catch (e) { next(e); } 
};

/**
 * Inicia u ocupa una mesa en el sistema (por ejemplo, cuando llegan clientes).
 * 
 * @async
 * @param {Object} req - Objeto de petición Express, incluyendo los parámetros y cuerpo.
 * @param {Object} res - Objeto de respuesta Express.
 * @param {Function} next - Middleware para el manejo de errores.
 * @returns {Promise<void>}
 */
const abrirMesa = async (req, res, next) => { 
    try { 
        // Validamos el ID de la mesa a través de Zod
        const id = z.coerce.number().int().parse(req.params.id); 
        // Validamos el cuerpo de la petición que debe incluir los minutos de límite de tiempo
        const val = abrirMesaSchema.parse(req.body); 
        
        // 🔥 Prisma: Update por ID
        // Actualizamos el estado de la mesa a OCUPADA y guardamos la hora actual
        const mesaActualizada = await prisma.mesas.update({
            where: { id: id },
            data: {
                estado: 'OCUPADA',
                hora_inicio: new Date(),
                tiempo_limite: val.minutos
            }
        });
        
        // ESPÍA BLINDADO (INICIO MESA) 
        // Registramos la acción en la tabla de auditoría para mantener trazabilidad
        try {
            await prisma.auditoria.create({
                data: {
                    usuario_id: req.usuario.id,
                    accion: 'INICIO MESA',
                    detalles: `Abrió la Mesa ${mesaActualizada.numero_mesa}`
                }
            });
        } catch (eEspia) { console.error("Aviso Espía:", eEspia.message); }
        
        res.json({ success: true }); 
        
        // Notificamos vía WebSockets a los clientes conectados para refrescar el mapa de mesas
        const io = req.app.get('socketio');
        if (io) io.emit('actualizar_mesas'); 
    } catch(e){ next(e); } 
};

/**
 * Obtiene los detalles de una mesa específica incluyendo el tiempo consumido 
 * y los productos solicitados que aún no se han pagado.
 * 
 * @async
 * @param {Object} req - Objeto de petición Express.
 * @param {Object} res - Objeto de respuesta Express.
 * @param {Function} next - Middleware para el manejo de errores.
 * @returns {Promise<void>} Un objeto JSON con los cálculos totales y los productos.
 */
const detalleMesa = async (req, res, next) => { 
    try { 
        // Parseamos el ID usando Zod
        const id = z.coerce.number().int().parse(req.params.id); 
        const precioHora = await getPrecioBillar(); 
        
        // Buscamos la mesa específica en la base de datos
        const mesa = await prisma.mesas.findUnique({ where: { id: id } });
        if (!mesa) return res.status(404).json({ error: 'Mesa no encontrada' });
        
        let totalT = 0, minReal = 0; 
        
        // Si es una mesa de tipo BILLAR y tiene hora de inicio, calculamos el costo del tiempo
        if (mesa.tipo === 'BILLAR' && mesa.hora_inicio) { 
            // Obtenemos los minutos transcurridos redondeados hacia arriba
            minReal = Math.ceil((new Date() - new Date(mesa.hora_inicio)) / 60000); 
            totalT = calcularCostoBillar(minReal, precioHora);
        }
        
        // 🔥 Prisma: Traemos los pedidos y le pedimos que "incluya" la info del producto (JOIN automático)
        const pedidos = await prisma.pedidos_mesa.findMany({
            where: { mesa_id: id, pagado: false },
            include: { productos: true }, // Nota: Verifica que la relación se llame "productos" en tu schema.prisma
            orderBy: { id: 'asc' }
        });
        
        let totalC = 0; 
        
        // Procesamos cada pedido calculando el subtotal y mapeando la información requerida
        const listaProductos = pedidos.map(pm => { 
            const precio_venta = Number(pm.productos.precio_venta); // Aseguramos que sea número (si usas Decimal)
            const subtotal = precio_venta * pm.cantidad;
            totalC += subtotal; 
            
            return { 
                id: pm.id,
                producto_id: pm.producto_id,
                nombre: pm.productos.nombre,
                cantidad: pm.cantidad,
                precio_venta: precio_venta,
                cliente_nombre: pm.cliente_nombre,
                subtotal: subtotal
            }; 
        }); 
        
        // Retornamos el desglose completo del detalle de cuenta para esta mesa
        res.json({ 
            tipo: mesa.tipo, 
            minutos: minReal, 
            totalTiempo: totalT, 
            listaProductos: listaProductos, 
            totalProductos: totalC, 
            totalFinal: totalT + totalC 
        }); 
    } catch (e) { next(e); } 
};

/**
 * Cierra una mesa y procesa el pago total (tiempo + productos consumidos).
 * Se aplican sellos para socios VIP si corresponde.
 * 
 * @async
 * @param {Object} req - Objeto de petición Express.
 * @param {Object} res - Objeto de respuesta Express.
 * @param {Function} next - Middleware para el manejo de errores.
 * @returns {Promise<void>}
 */
const cerrarMesa = async (req, res, next) => {
    try { 
        const id = z.coerce.number().int().parse(req.params.id); 
        const val = cerrarMesaSchema.parse(req.body); 
        const precioHora = await getPrecioBillar(); 
        
        const mesa = await prisma.mesas.findUnique({ where: { id: id } });
        
        let totalT = 0; 
        // Calculamos el costo asociado al tiempo para mesas de BILLAR
        if (mesa.tipo === 'BILLAR' && mesa.hora_inicio) { 
            const minReal = Math.ceil((new Date() - new Date(mesa.hora_inicio)) / 60000); 
            totalT = calcularCostoBillar(minReal, precioHora);
        }
        
        // Obtener total de productos calculando en memoria
        const pedidos = await prisma.pedidos_mesa.findMany({
            where: { mesa_id: id, pagado: false },
            include: { productos: true }
        });
        
        // Se suma el total de todos los productos (precio_venta * cantidad)
        const totalC = pedidos.reduce((acc, curr) => acc + (Number(curr.productos.precio_venta) * curr.cantidad), 0);
        const totalF = totalT + totalC; 
        
        // Asignación de montos dependiendo del método de pago (EFECTIVO, DIGITAL o MIXTO)
        const efectivo = val.metodo === 'MIXTO' ? (val.pago_efectivo || 0) : (val.metodo === 'EFECTIVO' ? totalF : 0);
        const digital = val.metodo === 'MIXTO' ? (val.pago_digital || 0) : (val.metodo !== 'EFECTIVO' && val.metodo !== 'MIXTO' ? totalF : 0);

        // Preparamos el array de transacciones para Prisma, asegurando atomicidad
        let transacciones = [
            prisma.ventas.create({
                data: {
                    mesa_id: id,
                    tipo_mesa: mesa.tipo,
                    total_tiempo: totalT,
                    total_productos: totalC,
                    total_final: totalF,
                    fecha: new Date(),
                    metodo_pago: val.metodo,
                    pago_efectivo: efectivo,
                    pago_digital: digital
                }
            }),
            // Marcamos todos los pedidos como pagados
            prisma.pedidos_mesa.updateMany({
                where: { mesa_id: id },
                data: { pagado: true }
            }),
            // Liberamos la mesa
            prisma.mesas.update({
                where: { id: id },
                data: { estado: 'LIBRE', hora_inicio: null, tiempo_limite: 0 }
            })
        ];

        // Lógica de fidelización: si es socio VIP, se acumulan sellos y se actualiza el nivel
        if (val.id_socio_vip) {
            const socio = await prisma.clientes.findUnique({ where: { id: val.id_socio_vip } });
            if (socio) {
                const nuevosSellos = (socio.sellos || 0) + 1;
                let nuevoNivel = 'Bronce';
                if (nuevosSellos >= 10) nuevoNivel = 'Plata';
                if (nuevosSellos >= 20) nuevoNivel = 'Oro';
                
                transacciones.push(
                    prisma.clientes.update({
                        where: { id: val.id_socio_vip },
                        data: { sellos: nuevosSellos, nivel: nuevoNivel }
                    })
                );
            }
        }

        // 🔥 Prisma: Transacción. Ejecutamos todo o nada. Evita datos corruptos si algo falla a la mitad.
        await prisma.$transaction(transacciones);
        
        // ESPÍA BLINDADO
        // Auditoría para reflejar que la mesa fue cobrada y liberada
        try {
            await prisma.auditoria.create({
                data: {
                    usuario_id: req.usuario.id,
                    accion: 'COBRO MESA',
                    detalles: `Cobró la Mesa ${mesa.numero_mesa} por un total de S/ ${totalF.toFixed(2)}`
                }
            });
        } catch (eEspia) { console.error("Aviso Espía:", eEspia.message); }

        res.json({ success: true }); 
        
        // Emitimos la actualización a todos los clientes para liberar la mesa visualmente y actualizar caja
        const io = req.app.get('socketio');
        if (io) {
            io.emit('actualizar_mesas'); 
            io.emit('actualizar_caja'); 
        }
    } catch (err) { next(err); }
};

/**
 * Traslada el consumo y estado de una mesa origen a una mesa destino.
 * Útil cuando los clientes desean cambiarse de ubicación.
 * 
 * @async
 * @param {Object} req - Objeto de petición Express.
 * @param {Object} res - Objeto de respuesta Express.
 * @param {Function} next - Middleware para el manejo de errores.
 * @returns {Promise<void>}
 */
const cambiarMesa = async (req, res, next) => { 
    try { 
        const val = cambiarMesaSchema.parse(req.body); 
        
        const origen = await prisma.mesas.findUnique({ where: { id: val.idOrigen } });
        const destino = await prisma.mesas.findUnique({ where: { id: val.idDestino } });
        
        // Verificaciones básicas de estado de mesa antes de trasladar
        if(origen.estado !== 'OCUPADA') return res.status(400).json({error: 'Mesa origen no ocupada'}); 
        if(destino.estado !== 'LIBRE') return res.status(400).json({error: 'Mesa destino ocupada'}); 
        
        // 🔥 Prisma: Múltiples actualizaciones usando Transacciones
        // Traspasamos el inicio de tiempo, los pedidos asociados y liberamos la mesa origen
        await prisma.$transaction([
            prisma.mesas.update({
                where: { id: val.idDestino },
                data: { estado: 'OCUPADA', hora_inicio: origen.hora_inicio }
            }),
            prisma.pedidos_mesa.updateMany({
                where: { mesa_id: val.idOrigen },
                data: { mesa_id: val.idDestino }
            }),
            prisma.mesas.update({
                where: { id: val.idOrigen },
                data: { estado: 'LIBRE', hora_inicio: null }
            })
        ]);
        
        res.json({ success: true }); 
        
        // Refrescamos la vista de mesas a nivel global
        const io = req.app.get('socketio');
        if (io) io.emit('actualizar_mesas'); 
    } catch (e) { next(e); } 
};

// ==========================================
// MÓDULO DE INFRAESTRUCTURA
// ==========================================

/**
 * Crea una nueva mesa en la infraestructura del local (ej. nueva mesa de billar).
 * Asigna automáticamente el siguiente número disponible.
 * 
 * @async
 * @param {Object} req - Objeto de petición Express.
 * @param {Object} res - Objeto de respuesta Express.
 * @param {Function} next - Middleware para el manejo de errores.
 * @returns {Promise<void>}
 */
const crearMesa = async (req, res, next) => {
    const { tipo } = req.body; 
    try {
        // 🔥 Prisma: Buscar la última mesa creada
        const ultimaMesa = await prisma.mesas.findFirst({
            orderBy: { numero_mesa: 'desc' }
        });
        
        // Determinamos el número consecutivo para la nueva mesa
        const nuevoNumero = ultimaMesa ? ultimaMesa.numero_mesa + 1 : 1;

        // Se inserta la mesa como LIBRE
        await prisma.mesas.create({
            data: {
                numero_mesa: nuevoNumero,
                tipo: tipo,
                estado: 'LIBRE'
            }
        });
        
        res.status(200).json({ message: 'Infraestructura actualizada: Mesa creada.' });
    } catch (error) { next(error); }
};

/**
 * Elimina la última mesa creada en la infraestructura (ej. se retira una mesa del local).
 * 
 * @async
 * @param {Object} req - Objeto de petición Express.
 * @param {Object} res - Objeto de respuesta Express.
 * @param {Function} next - Middleware para el manejo de errores.
 * @returns {Promise<void>}
 */
const eliminarUltimaMesa = async (req, res, next) => {
    try {
        const ultimaMesa = await prisma.mesas.findFirst({
            orderBy: { numero_mesa: 'desc' }
        });
        
        if (!ultimaMesa) {
            return res.status(400).json({ error: 'No hay mesas registradas en el sistema.' });
        }

        // Medida de seguridad: evitar borrar una mesa con clientes o pedidos activos
        if (ultimaMesa.estado !== 'LIBRE') {
            return res.status(400).json({ error: 'Operación denegada: La última mesa está OCUPADA. Ciérrela primero.' });
        }

        await prisma.mesas.delete({ where: { id: ultimaMesa.id } });
        
        res.status(200).json({ message: 'Infraestructura actualizada: Mesa retirada.' });
    } catch (error) { next(error); }
};

/**
 * Permite cerrar una cuenta parcial basada en un nombre de cliente dentro de una mesa.
 * Útil cuando varias personas ocupan una mesa y una de ellas desea pagar sus consumos y retirarse.
 * 
 * @async
 * @param {Object} req - Objeto de petición Express.
 * @param {Object} res - Objeto de respuesta Express.
 * @param {Function} next - Middleware para el manejo de errores.
 * @returns {Promise<void>}
 */
const cerrarCuentaPersonal = async (req, res, next) => {
    try {
        const idMesa = z.coerce.number().int().parse(req.params.id);
        const { cliente_nombre, metodo, pago_efectivo, pago_digital } = req.body;

        // Recuperamos solo los pedidos pendientes asociados a ese cliente particular
        const pedidos = await prisma.pedidos_mesa.findMany({
            where: { mesa_id: idMesa, cliente_nombre: cliente_nombre, pagado: false },
            include: { productos: true }
        });

        // Sumamos el valor total de la deuda de la persona
        const totalProductos = pedidos.reduce((acc, curr) => acc + (Number(curr.productos.precio_venta) * curr.cantidad), 0);

        if (totalProductos === 0) {
            return res.status(400).json({ error: 'No hay productos pendientes para esta persona.' });
        }

        // Asignamos montos dependiendo del método (Mixto o Individual)
        const efectivo = metodo === 'MIXTO' ? (pago_efectivo || 0) : (metodo === 'EFECTIVO' ? totalProductos : 0);
        const digital = metodo === 'MIXTO' ? (pago_digital || 0) : (metodo !== 'EFECTIVO' && metodo !== 'MIXTO' ? totalProductos : 0);

        const mesaDb = await prisma.mesas.findUnique({ where: { id: idMesa } });

        // Ejecutamos de forma atómica: la creación de la venta parcial y la marcación de los pedidos como pagados
        await prisma.$transaction([
            prisma.ventas.create({
                data: {
                    mesa_id: idMesa,
                    tipo_mesa: 'PAGO PARCIAL',
                    total_tiempo: 0,
                    total_productos: totalProductos,
                    total_final: totalProductos,
                    fecha: new Date(),
                    metodo_pago: metodo,
                    pago_efectivo: efectivo,
                    pago_digital: digital
                }
            }),
            prisma.pedidos_mesa.updateMany({
                where: { mesa_id: idMesa, cliente_nombre: cliente_nombre, pagado: false },
                data: { pagado: true }
            })
        ]);

        // Registrar auditoría de cobro parcial
        try {
            await prisma.auditoria.create({
                data: {
                    usuario_id: req.usuario.id,
                    accion: 'PAGO PARCIAL',
                    detalles: `Cobró la cuenta de ${cliente_nombre} en Mesa ${mesaDb.numero_mesa} por S/ ${totalProductos.toFixed(2)}`
                }
            });
        } catch (eEspia) { console.error("Aviso Espía:", eEspia.message); }

        res.json({ success: true, cobrado: totalProductos });

        // Actualizamos las vistas a través de WebSockets
        const io = req.app.get('socketio');
        if (io) {
            io.emit('actualizar_mesas'); 
            io.emit('actualizar_caja'); 
        }
    } catch (err) { next(err); }
};

/**
 * Obtiene la lista de nombres de los clientes dentro de una mesa 
 * junto con el total de sus respectivas deudas por productos consumidos.
 * 
 * @async
 * @param {Object} req - Objeto de petición Express.
 * @param {Object} res - Objeto de respuesta Express.
 * @param {Function} next - Middleware para el manejo de errores.
 * @returns {Promise<void>} Lista de objetos con 'nombre' y 'total'.
 */
const obtenerNombresMesa = async (req, res, next) => {
    try {
        const id = z.coerce.number().int().parse(req.params.id);
        const mesa = await prisma.mesas.findUnique({ where: { id } });
        
        // Buscar todos los pedidos desde que se abrió la mesa (para no borrar los nombres de los que ya pagaron)
        // Esto ayuda a tener el historial de personas de la sesión actual de la mesa
        const whereClause = (mesa && mesa.hora_inicio)
            ? { mesa_id: id, fecha_creacion: { gte: mesa.hora_inicio } }
            : { mesa_id: id, pagado: false };

        const pedidos = await prisma.pedidos_mesa.findMany({
            where: whereClause,
            include: { productos: true }
        });
        
        // Agrupar por cliente_nombre y sumar totales (solo los que faltan pagar)
        const cuentasMap = {};
        pedidos.forEach(p => {
            const nombre = p.cliente_nombre || 'General';
            // Ignoramos a los generales o nombres en blanco, ya que el objetivo es cobro personal
            if (nombre === 'General' || nombre.trim() === '') return;
            
            if (!cuentasMap[nombre]) cuentasMap[nombre] = 0;
            
            // Solo acumula deuda si el pedido NO ha sido pagado, 
            // aunque mantenemos la persona en la lista si consumió previamente
            if (!p.pagado) {
                cuentasMap[nombre] += (Number(p.productos.precio_venta) * p.cantidad);
            }
        });
        
        // Transformar el mapa en un arreglo limpio para enviar al cliente
        const nombresConTotales = Object.keys(cuentasMap).map(nombre => ({
            nombre: nombre,
            total: cuentasMap[nombre]
        }));
            
        res.json(nombresConTotales);
    } catch (e) { next(e); }
};

module.exports = { 
    obtenerMesas, abrirMesa, detalleMesa, cerrarMesa, 
    cambiarMesa, crearMesa, eliminarUltimaMesa, 
    cerrarCuentaPersonal, obtenerNombresMesa 
};