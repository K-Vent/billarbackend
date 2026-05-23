const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const { z } = require('zod');

// ==========================================
// 1. ESQUEMAS DE VALIDACIÓN (ZOD) - (Intactos)
// ==========================================
const abrirMesaSchema = z.object({
    minutos: z.number().int().min(0)
});

const cerrarMesaSchema = z.object({
    metodo: z.enum(['EFECTIVO', 'DIGITAL', 'MIXTO']),
    pago_efectivo: z.number().optional(),
    pago_digital: z.number().optional()
});

const cambiarMesaSchema = z.object({
    idOrigen: z.number().int(),
    idDestino: z.number().int()
});

// ==========================================
// 2. FUNCIONES AUXILIARES (Intactas)
// ==========================================
let configCache = { precio_billar: 10, ultimaActualizacion: 0 };

async function getPrecioBillar() {
    return configCache.precio_billar;
}

function calcularCostoBillar(minutosTotales, precioHora) {
    const precioMediaHora = precioHora / 2;
    if (minutosTotales <= 5) return 0; 
    const bloquesACobrar = Math.ceil((minutosTotales - 5) / 30);
    return bloquesACobrar * precioMediaHora;
}

// ==========================================
// 3. CONTROLADORES (Refactorizados a Prisma)
// ==========================================

const obtenerMesas = async (req, res, next) => { 
    try { 
        const precio = await getPrecioBillar(); 
        
        // 🔥 Prisma: Búsqueda ordenada simple
        const mesasDb = await prisma.mesas.findMany({
            orderBy: { numero_mesa: 'asc' }
        });
        
        const now = new Date(); // Obtenemos la hora actual en JS
        
        const mesas = mesasDb.map(m => { 
            // 🔥 Adiós EXTRACT(EPOCH). Matemática pura y rápida en Node.js
            let segundos = 0;
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

const abrirMesa = async (req, res, next) => { 
    try { 
        const id = z.coerce.number().int().parse(req.params.id); 
        const val = abrirMesaSchema.parse(req.body); 
        
        // 🔥 Prisma: Update por ID
        const mesaActualizada = await prisma.mesas.update({
            where: { id: id },
            data: {
                estado: 'OCUPADA',
                hora_inicio: new Date(),
                tiempo_limite: val.minutos
            }
        });
        
        // ESPÍA BLINDADO (INICIO MESA) 
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
        
        const io = req.app.get('socketio');
        if (io) io.emit('actualizar_mesas'); 
    } catch(e){ next(e); } 
};

const detalleMesa = async (req, res, next) => { 
    try { 
        const id = z.coerce.number().int().parse(req.params.id); 
        const precioHora = await getPrecioBillar(); 
        
        const mesa = await prisma.mesas.findUnique({ where: { id: id } });
        if (!mesa) return res.status(404).json({ error: 'Mesa no encontrada' });
        
        let totalT = 0, minReal = 0; 
        
        if (mesa.tipo === 'BILLAR' && mesa.hora_inicio) { 
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

const cerrarMesa = async (req, res, next) => {
    try { 
        const id = z.coerce.number().int().parse(req.params.id); 
        const val = cerrarMesaSchema.parse(req.body); 
        const precioHora = await getPrecioBillar(); 
        
        const mesa = await prisma.mesas.findUnique({ where: { id: id } });
        
        let totalT = 0; 
        if (mesa.tipo === 'BILLAR' && mesa.hora_inicio) { 
            const minReal = Math.ceil((new Date() - new Date(mesa.hora_inicio)) / 60000); 
            totalT = calcularCostoBillar(minReal, precioHora);
        }
        
        // Obtener total de productos calculando en memoria
        const pedidos = await prisma.pedidos_mesa.findMany({
            where: { mesa_id: id, pagado: false },
            include: { productos: true }
        });
        
        const totalC = pedidos.reduce((acc, curr) => acc + (Number(curr.productos.precio_venta) * curr.cantidad), 0);
        const totalF = totalT + totalC; 
        
        const efectivo = val.metodo === 'MIXTO' ? (val.pago_efectivo || 0) : (val.metodo === 'EFECTIVO' ? totalF : 0);
        const digital = val.metodo === 'MIXTO' ? (val.pago_digital || 0) : (val.metodo !== 'EFECTIVO' && val.metodo !== 'MIXTO' ? totalF : 0);

        // 🔥 Prisma: Transacción. Ejecutamos todo o nada. Evita datos corruptos si algo falla a la mitad.
        await prisma.$transaction([
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
            prisma.pedidos_mesa.updateMany({
                where: { mesa_id: id },
                data: { pagado: true }
            }),
            prisma.mesas.update({
                where: { id: id },
                data: { estado: 'LIBRE', hora_inicio: null, tiempo_limite: 0 }
            })
        ]);
        
        // ESPÍA BLINDADO
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
        
        const io = req.app.get('socketio');
        if (io) {
            io.emit('actualizar_mesas'); 
            io.emit('actualizar_caja'); 
        }
    } catch (err) { next(err); }
};

const cambiarMesa = async (req, res, next) => { 
    try { 
        const val = cambiarMesaSchema.parse(req.body); 
        
        const origen = await prisma.mesas.findUnique({ where: { id: val.idOrigen } });
        const destino = await prisma.mesas.findUnique({ where: { id: val.idDestino } });
        
        if(origen.estado !== 'OCUPADA') return res.status(400).json({error: 'Mesa origen no ocupada'}); 
        if(destino.estado !== 'LIBRE') return res.status(400).json({error: 'Mesa destino ocupada'}); 
        
        // 🔥 Prisma: Múltiples actualizaciones usando Transacciones
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
        
        const io = req.app.get('socketio');
        if (io) io.emit('actualizar_mesas'); 
    } catch (e) { next(e); } 
};

// ==========================================
// MÓDULO DE INFRAESTRUCTURA
// ==========================================

const crearMesa = async (req, res, next) => {
    const { tipo } = req.body; 
    try {
        // 🔥 Prisma: Buscar la última mesa creada
        const ultimaMesa = await prisma.mesas.findFirst({
            orderBy: { numero_mesa: 'desc' }
        });
        
        const nuevoNumero = ultimaMesa ? ultimaMesa.numero_mesa + 1 : 1;

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

const eliminarUltimaMesa = async (req, res, next) => {
    try {
        const ultimaMesa = await prisma.mesas.findFirst({
            orderBy: { numero_mesa: 'desc' }
        });
        
        if (!ultimaMesa) {
            return res.status(400).json({ error: 'No hay mesas registradas en el sistema.' });
        }

        if (ultimaMesa.estado !== 'LIBRE') {
            return res.status(400).json({ error: 'Operación denegada: La última mesa está OCUPADA. Ciérrela primero.' });
        }

        await prisma.mesas.delete({ where: { id: ultimaMesa.id } });
        
        res.status(200).json({ message: 'Infraestructura actualizada: Mesa retirada.' });
    } catch (error) { next(error); }
};

const cerrarCuentaPersonal = async (req, res, next) => {
    try {
        const idMesa = z.coerce.number().int().parse(req.params.id);
        const { cliente_nombre, metodo, pago_efectivo, pago_digital } = req.body;

        const pedidos = await prisma.pedidos_mesa.findMany({
            where: { mesa_id: idMesa, cliente_nombre: cliente_nombre, pagado: false },
            include: { productos: true }
        });

        const totalProductos = pedidos.reduce((acc, curr) => acc + (Number(curr.productos.precio_venta) * curr.cantidad), 0);

        if (totalProductos === 0) {
            return res.status(400).json({ error: 'No hay productos pendientes para esta persona.' });
        }

        const efectivo = metodo === 'MIXTO' ? (pago_efectivo || 0) : (metodo === 'EFECTIVO' ? totalProductos : 0);
        const digital = metodo === 'MIXTO' ? (pago_digital || 0) : (metodo !== 'EFECTIVO' && metodo !== 'MIXTO' ? totalProductos : 0);

        const mesaDb = await prisma.mesas.findUnique({ where: { id: idMesa } });

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

        const io = req.app.get('socketio');
        if (io) {
            io.emit('actualizar_mesas'); 
            io.emit('actualizar_caja'); 
        }
    } catch (err) { next(err); }
};

const obtenerNombresMesa = async (req, res, next) => {
    try {
        const id = z.coerce.number().int().parse(req.params.id);
        
        // Prisma: Para simular un SELECT DISTINCT, usamos findMany con distinct
        const registros = await prisma.pedidos_mesa.findMany({
            where: { mesa_id: id, pagado: false },
            select: { cliente_nombre: true },
            distinct: ['cliente_nombre']
        });
        
        const nombres = registros
            .map(row => row.cliente_nombre)
            .filter(n => n !== 'General' && n !== null && n.trim() !== '');
            
        res.json(nombres);
    } catch (e) { next(e); }
};

module.exports = { 
    obtenerMesas, abrirMesa, detalleMesa, cerrarMesa, 
    cambiarMesa, crearMesa, eliminarUltimaMesa, 
    cerrarCuentaPersonal, obtenerNombresMesa 
};