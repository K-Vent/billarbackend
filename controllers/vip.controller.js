const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

// ==========================================
// CONTROLADORES VIP Y FIDELIZACIÓN
// ==========================================

const obtenerClientes = async (req, res, next) => {
    try {
        const clientes = await prisma.clientes.findMany({
            orderBy: [
                { sellos: 'desc' },
                { fecha_registro: 'desc' }
            ]
        });
        res.json(clientes);
    } catch (e) { 
        next(e); 
    }
};

const registrarCliente = async (req, res, next) => {
    try {
        console.log("[VIP] Registrando nuevo socio:", req.body);

        const { nombre, telefono, pin, clave } = req.body; 
        const userPin = pin || clave;
        
        if (!nombre) return res.status(400).json({ error: "El nombre es obligatorio" });
        
        if (!userPin || userPin.trim() === "") {
            return res.status(400).json({ error: "El PIN o clave no puede estar vacío." });
        }

        if (telefono) {
            const existe = await prisma.clientes.findUnique({
                where: { telefono: telefono }
            });
            if (existe) return res.status(400).json({ error: "Este teléfono ya está registrado" });
        }

        await prisma.clientes.create({
            data: {
                nombre: nombre,
                telefono: telefono,
                pin: userPin
            }
        });

        res.json({ success: true });
    } catch (e) { 
        next(e); 
    }
};

const loginVip = async (req, res, next) => {
    try {
        const { telefono, pin } = req.body;
        
        const cliente = await prisma.clientes.findFirst({
            where: {
                telefono: telefono,
                pin: pin
            },
            select: {
                id: true,
                nombre: true,
                sellos: true,
                nivel: true,
                premios_canjeados: true
            }
        });
        
        if (!cliente) return res.status(401).json({ error: "Teléfono o PIN incorrectos." });
        
        res.json(cliente);
    } catch (e) { 
        next(e); 
    }
};

const agregarSello = async (req, res, next) => {
    try {
        const id = parseInt(req.params.id);
        
        // 1. Incrementamos el sello atómicamente
        const clienteActualizado = await prisma.clientes.update({
            where: { id: id },
            data: { sellos: { increment: 1 } }
        });
        
        const totalSellos = clienteActualizado.sellos;
        
        // 2. Motor de rangos
        let nuevoNivel = 'Bronce';
        if (totalSellos >= 10) nuevoNivel = 'Plata';
        if (totalSellos >= 20) nuevoNivel = 'Oro';

        // 3. Actualizamos el nivel si es necesario
        if (clienteActualizado.nivel !== nuevoNivel) {
            await prisma.clientes.update({
                where: { id: id },
                data: { nivel: nuevoNivel }
            });
        }

        res.json({ success: true, sellos_actuales: totalSellos, nivel: nuevoNivel });
    } catch (e) { 
        next(e); 
    }
};

const canjearPremio = async (req, res, next) => {
    try {
        const id = parseInt(req.params.id);
        
        const cliente = await prisma.clientes.findUnique({
            where: { id: id },
            select: { sellos: true, premios_canjeados: true }
        });

        if (!cliente) return res.status(404).json({ error: "Socio no encontrado" });
        
        const canjeados = cliente.premios_canjeados || 0;
        const premiosDisponibles = Math.floor(cliente.sellos / 7) - canjeados;

        if (premiosDisponibles > 0) {
            await prisma.clientes.update({
                where: { id: id },
                data: { premios_canjeados: { increment: 1 } }
            });
            res.json({ success: true });
        } else {
            res.status(400).json({ error: "Este socio no tiene recompensas pendientes de cobro." });
        }
    } catch (e) { 
        next(e); 
    }
};

const escanearQr = async (req, res, next) => {
    try {
        const codigo = req.params.codigo; 
        if (!codigo.startsWith('socio-')) return res.status(400).json({ error: "QR no válido para este sistema." });
        
        const idSocio = parseInt(codigo.split('-')[1]);
        
        const cliente = await prisma.clientes.findUnique({
            where: { id: idSocio },
            select: { id: true, nombre: true, sellos: true, nivel: true, premios_canjeados: true }
        });
        
        if (!cliente) return res.status(404).json({ error: "Socio no encontrado." });
        
        const canjeados = cliente.premios_canjeados || 0;
        const premiosDisponibles = Math.floor(cliente.sellos / 7) - canjeados;
        
        res.json({ 
            id: cliente.id, 
            nombre: cliente.nombre, 
            nivel: cliente.nivel, 
            premios: premiosDisponibles 
        });
    } catch (e) { 
        next(e); 
    }
};

/**
 * Transacción Crítica: Canje de 1 hora gratis.
 * Garantiza que el premio se descuente SOLO si la mesa se actualiza y la auditoría se registra.
 */
const canjeSeguroTransaccion = async (req, res, next) => {
    try {
        const { idSocio, idMesa } = req.body;

        // 🔥 Prisma Interactive Transaction
        await prisma.$transaction(async (tx) => {
            // 1. Verificación de fondos (Premios)
            const socio = await tx.clientes.findUnique({ where: { id: idSocio } });
            if (!socio) throw new Error("Socio no encontrado en el padrón.");

            const premiosDisponibles = Math.floor(socio.sellos / 7) - (socio.premios_canjeados || 0);
            if (premiosDisponibles <= 0) throw new Error("El socio no tiene premios disponibles.");

            // 1.5 Verificación de Límite Diario (1 por día)
            const hoy = new Date();
            hoy.setHours(0,0,0,0);
            const canjesHoy = await tx.auditoria.count({
                where: {
                    accion: 'CANJE VIP',
                    detalles: { contains: `Socio ID ${idSocio} ` },
                    fecha: { gte: hoy }
                }
            });
            if (canjesHoy >= 1) {
                throw new Error("El socio ya ha canjeado una hora gratis el día de hoy. Límite de 1 por día.");
            }

            // 2. Obtener estado actual de la mesa para inyectar la hora gratis
            const mesa = await tx.mesas.findUnique({ where: { id: idMesa } });
            if (!mesa || !mesa.hora_inicio) throw new Error("La mesa debe estar ocupada y corriendo para aplicar el beneficio.");

            // 3. Modificación del tiempo (Matemática de Node.js en milisegundos)
            const nuevaHoraInicio = new Date(mesa.hora_inicio.getTime() + (60 * 60 * 1000)); // Añade 1 hora

            // 4. Ejecución atómica de actualizaciones
            await tx.clientes.update({
                where: { id: idSocio },
                data: { premios_canjeados: { increment: 1 } }
            });

            await tx.mesas.update({
                where: { id: idMesa },
                data: { hora_inicio: nuevaHoraInicio }
            });

            await tx.auditoria.create({
                data: {
                    usuario_id: req.usuario.id,
                    accion: 'CANJE VIP',
                    detalles: `Socio ID ${idSocio} usó 1 hora gratis en Mesa ${mesa.numero_mesa}`
                }
            });
        }); // Si alguna de las promesas de arriba falla, Prisma hace el ROLLBACK automático

        res.json({ success: true });
    } catch (e) { 
        res.status(400).json({ error: e.message || "Error en la transacción de canje" });
    } 
};

// ==========================================
// CONTROLADORES DE BENEFICIOS (CMS)
// ==========================================

const obtenerBeneficios = async (req, res, next) => {
    try {
        const beneficios = await prisma.beneficios.findMany({
            orderBy: { id: 'asc' }
        });
        res.json(beneficios);
    } catch (e) { 
        next(e); 
    }
};

const agregarBeneficio = async (req, res, next) => {
    try {
        const { nivel, descripcion } = req.body;
        if (!nivel || !descripcion) return res.status(400).json({ error: "Faltan datos" });
        
        await prisma.beneficios.create({
            data: {
                nivel: nivel,
                descripcion: descripcion
            }
        });
        res.json({ success: true });
    } catch (e) { 
        next(e); 
    }
};

const eliminarBeneficio = async (req, res, next) => {
    try {
        const id = parseInt(req.params.id);
        await prisma.beneficios.delete({
            where: { id: id }
        });
        res.json({ success: true });
    } catch (e) { 
        next(e); 
    }
};

const eliminarCliente = async (req, res, next) => {
    try {
        const id = parseInt(req.params.id);
        
        await prisma.clientes.delete({
            where: { id: id }
        });
        
        res.status(200).json({ message: 'Socio VIP eliminado correctamente' });
        
    } catch (error) {
        console.error("[ERROR CRITICO] Error al eliminar cliente:", error.message);
        
        // Prisma ERROR CODE P2003 = Foreign Key Constraint Failed
        // Reemplaza el antiguo código '23503' de pg.
        if (error.code === 'P2003') {
            return res.status(500).json({ 
                error: 'Seguridad: No puedes borrar a este cliente porque tiene historial de canjes o compras vinculadas en el sistema.' 
            });
        }

        res.status(500).json({ error: 'Error en la base de datos al intentar eliminar la membresía.' });
    }
};

module.exports = { 
    obtenerClientes, 
    registrarCliente, 
    loginVip, 
    agregarSello, 
    canjearPremio, 
    escanearQr, 
    canjeSeguroTransaccion, 
    obtenerBeneficios, 
    agregarBeneficio, 
    eliminarBeneficio, 
    eliminarCliente
};