const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const { z } = require('zod');

// ==========================================
// CONTROLADORES VIP Y FIDELIZACIÓN
// ==========================================

/**
 * Obtiene la lista de todos los clientes VIP registrados.
 * Los clientes se ordenan primero por la cantidad de sellos (descendente) 
 * y luego por la fecha de registro (descendente).
 * 
 * @async
 * @function obtenerClientes
 * @param {Object} req - Objeto de solicitud de Express.
 * @param {Object} res - Objeto de respuesta de Express.
 * @param {Function} next - Función de middleware para manejo de errores.
 * @returns {Promise<void>} Retorna un JSON con la lista de clientes.
 */
const obtenerClientes = async (req, res, next) => {
    try {
        // Obtenemos los clientes desde la base de datos ordenados por sellos y fecha
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

/**
 * Registra un nuevo cliente en el sistema VIP.
 * Valida la presencia de nombre y PIN/clave, además de comprobar que el teléfono no esté duplicado.
 * 
 * @async
 * @function registrarCliente
 * @param {Object} req - Objeto de solicitud de Express que contiene los datos del cliente.
 * @param {Object} res - Objeto de respuesta de Express.
 * @param {Function} next - Función de middleware para manejo de errores.
 * @returns {Promise<void>} Retorna un JSON de éxito o un mensaje de error.
 */
const registrarCliente = async (req, res, next) => {
    try {
        const { nombre, telefono, pin, clave } = req.body; 
        // Permitimos usar la propiedad "pin" o "clave"
        const userPin = pin || clave;
        
        // Validación básica del nombre
        if (!nombre) return res.status(400).json({ error: "El nombre es obligatorio" });
        
        // Validación básica del PIN
        if (!userPin || userPin.trim() === "") {
            return res.status(400).json({ error: "El PIN o clave no puede estar vacío." });
        }

        // Si se proporciona un teléfono, verificamos si ya existe en la base de datos
        if (telefono) {
            const existe = await prisma.clientes.findUnique({
                where: { telefono: telefono }
            });
            if (existe) return res.status(400).json({ error: "Este teléfono ya está registrado" });
        }

        // Creación del nuevo registro de cliente
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

/**
 * Autentica a un cliente VIP usando su teléfono y PIN.
 * 
 * @async
 * @function loginVip
 * @param {Object} req - Objeto de solicitud de Express con teléfono y pin.
 * @param {Object} res - Objeto de respuesta de Express.
 * @param {Function} next - Función de middleware para manejo de errores.
 * @returns {Promise<void>} Retorna un JSON con los datos básicos del cliente o error 401.
 */
const loginVip = async (req, res, next) => {
    try {
        const { telefono, pin } = req.body;
        
        // Buscamos un cliente que coincida con teléfono y PIN exactos
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
        
        // Si no se encuentra un registro coincidente, devolvemos error de autorización
        if (!cliente) return res.status(401).json({ error: "Teléfono o PIN incorrectos." });
        
        res.json(cliente);
    } catch (e) { 
        next(e); 
    }
};

/**
 * Agrega un sello al cliente especificado por su ID y actualiza su nivel VIP si corresponde.
 * 
 * @async
 * @function agregarSello
 * @param {Object} req - Objeto de solicitud de Express, contiene el ID del cliente en params.
 * @param {Object} res - Objeto de respuesta de Express.
 * @param {Function} next - Función de middleware para manejo de errores.
 * @returns {Promise<void>} Retorna un JSON indicando éxito, cantidad de sellos y nivel.
 */
const agregarSello = async (req, res, next) => {
    try {
        const id = z.coerce.number().int().parse(req.params.id);
        
        // 1. Incrementamos el sello atómicamente en la base de datos
        const clienteActualizado = await prisma.clientes.update({
            where: { id: id },
            data: { sellos: { increment: 1 } }
        });
        
        const totalSellos = clienteActualizado.sellos;
        
        // 2. Motor de rangos: determinamos el nivel en función de la cantidad de sellos
        let nuevoNivel = 'Bronce';
        if (totalSellos >= 10) nuevoNivel = 'Plata';
        if (totalSellos >= 20) nuevoNivel = 'Oro';

        // 3. Actualizamos el nivel si el cálculo arrojó un nivel distinto al actual
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

/**
 * Realiza el canje de un premio estándar sumando uno a la cuenta de premios canjeados.
 * Calcula la disponibilidad de premios tomando en cuenta que cada 7 sellos equivale a 1 premio.
 * 
 * @async
 * @function canjearPremio
 * @param {Object} req - Objeto de solicitud de Express.
 * @param {Object} res - Objeto de respuesta de Express.
 * @param {Function} next - Función de middleware para manejo de errores.
 * @returns {Promise<void>} JSON con éxito si se pudo canjear, o error si no tiene suficientes.
 */
const canjearPremio = async (req, res, next) => {
    try {
        const id = z.coerce.number().int().parse(req.params.id);
        
        // Obtenemos únicamente la información necesaria para calcular premios
        const cliente = await prisma.clientes.findUnique({
            where: { id: id },
            select: { sellos: true, premios_canjeados: true }
        });

        if (!cliente) return res.status(404).json({ error: "Socio no encontrado" });
        
        const canjeados = cliente.premios_canjeados || 0;
        // Calculamos los premios disponibles restando los ya canjeados
        const premiosDisponibles = Math.floor(cliente.sellos / 7) - canjeados;

        // Si existen premios pendientes, realizamos el incremento
        if (premiosDisponibles > 0) {
            await prisma.clientes.update({
                where: { id: id },
                data: { premios_canjeados: { increment: 1 } }
            });
            res.json({ success: true });
        } else {
            // Caso contrario, se deniega la petición
            res.status(400).json({ error: "Este socio no tiene recompensas pendientes de cobro." });
        }
    } catch (e) { 
        next(e); 
    }
};

/**
 * Escanea un código QR perteneciente a un socio y devuelve la información de sus premios.
 * 
 * @async
 * @function escanearQr
 * @param {Object} req - Objeto de solicitud de Express, contiene el código QR en params.
 * @param {Object} res - Objeto de respuesta de Express.
 * @param {Function} next - Función de middleware para manejo de errores.
 * @returns {Promise<void>} Información del socio y la cantidad de premios disponibles.
 */
const escanearQr = async (req, res, next) => {
    try {
        const codigo = req.params.codigo; 
        
        // Validamos el formato del QR
        if (!codigo.startsWith('socio-')) return res.status(400).json({ error: "QR no válido para este sistema." });
        
        // Extraemos el ID numérico del código QR usando Zod para validación
        const idSocio = z.coerce.number().int().parse(codigo.split('-')[1]);
        
        const cliente = await prisma.clientes.findUnique({
            where: { id: idSocio },
            select: { id: true, nombre: true, sellos: true, nivel: true, premios_canjeados: true }
        });
        
        if (!cliente) return res.status(404).json({ error: "Socio no encontrado." });
        
        // Calculamos cuántos premios le quedan por canjear
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
 * Utiliza transacciones de base de datos para asegurar atomicidad.
 * 
 * @async
 * @function canjeSeguroTransaccion
 * @param {Object} req - Objeto de solicitud de Express.
 * @param {Object} res - Objeto de respuesta de Express.
 * @param {Function} next - Función de middleware para manejo de errores.
 * @returns {Promise<void>} JSON con éxito si la transacción fue completada.
 */
const canjeSeguroTransaccion = async (req, res, next) => {
    try {
        const { idSocio, idMesa } = req.body;

        // 🔥 Prisma Interactive Transaction
        await prisma.$transaction(async (tx) => {
            // 1. Verificación de fondos (Premios)
            const socio = await tx.clientes.findUnique({ where: { id: idSocio } });
            if (!socio) throw new Error("Socio no encontrado en el padrón.");

            // Calculamos premios que le restan al socio
            const premiosDisponibles = Math.floor(socio.sellos / 7) - (socio.premios_canjeados || 0);
            if (premiosDisponibles <= 0) throw new Error("El socio no tiene premios disponibles.");

            // 1.5 Verificación de Límite Diario (1 por día)
            const hoy = new Date();
            hoy.setHours(0,0,0,0);
            
            // Buscamos si ya hubo un canje en el día actual para este socio
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
            // Se le suma 1 hora de ventaja retrasando su hora_inicio
            const nuevaHoraInicio = new Date(mesa.hora_inicio.getTime() + (60 * 60 * 1000)); // Añade 1 hora

            // 4. Ejecución atómica de actualizaciones
            
            // Descontamos un premio de su cuenta incrementando premios_canjeados
            await tx.clientes.update({
                where: { id: idSocio },
                data: { premios_canjeados: { increment: 1 } }
            });

            // Actualizamos la mesa con el nuevo tiempo para reflejar el canje
            await tx.mesas.update({
                where: { id: idMesa },
                data: { hora_inicio: nuevaHoraInicio }
            });

            // Dejamos un registro de auditoría de este movimiento
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

/**
 * Obtiene la lista de todos los beneficios del sistema VIP.
 * 
 * @async
 * @function obtenerBeneficios
 * @param {Object} req - Objeto de solicitud de Express.
 * @param {Object} res - Objeto de respuesta de Express.
 * @param {Function} next - Función de middleware para manejo de errores.
 * @returns {Promise<void>} Lista de beneficios disponibles ordenados por ID.
 */
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

/**
 * Agrega un nuevo beneficio asociado a un nivel VIP en particular.
 * 
 * @async
 * @function agregarBeneficio
 * @param {Object} req - Objeto de solicitud de Express, debe incluir nivel y descripción.
 * @param {Object} res - Objeto de respuesta de Express.
 * @param {Function} next - Función de middleware para manejo de errores.
 * @returns {Promise<void>} Respuesta indicando éxito al agregar beneficio.
 */
const agregarBeneficio = async (req, res, next) => {
    try {
        const { nivel, descripcion } = req.body;
        // Validamos que se provean ambos campos necesarios
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

/**
 * Elimina un beneficio específico mediante su ID.
 * 
 * @async
 * @function eliminarBeneficio
 * @param {Object} req - Objeto de solicitud de Express, incluye ID en params.
 * @param {Object} res - Objeto de respuesta de Express.
 * @param {Function} next - Función de middleware para manejo de errores.
 * @returns {Promise<void>} Respuesta indicando éxito de la eliminación.
 */
const eliminarBeneficio = async (req, res, next) => {
    try {
        const id = z.coerce.number().int().parse(req.params.id);
        await prisma.beneficios.delete({
            where: { id: id }
        });
        res.json({ success: true });
    } catch (e) { 
        next(e); 
    }
};

/**
 * Elimina a un cliente VIP de la base de datos si es que no tiene un historial vinculado.
 * 
 * @async
 * @function eliminarCliente
 * @param {Object} req - Objeto de solicitud de Express.
 * @param {Object} res - Objeto de respuesta de Express.
 * @param {Function} next - Función de middleware para manejo de errores.
 * @returns {Promise<void>} Mensaje de confirmación o un error de clave foránea.
 */
const eliminarCliente = async (req, res, next) => {
    try {
        const id = z.coerce.number().int().parse(req.params.id);
        
        await prisma.clientes.delete({
            where: { id: id }
        });
        
        res.status(200).json({ message: 'Socio VIP eliminado correctamente' });
        
    } catch (error) {
        console.error("[ERROR CRITICO] Error al eliminar cliente:", error.message);
        
        // Prisma ERROR CODE P2003 = Foreign Key Constraint Failed
        // Reemplaza el antiguo código '23503' de pg.
        // Impedimos borrar si hay registros relacionados para mantener integridad referencial
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