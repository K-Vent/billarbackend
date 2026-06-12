const express = require('express');
const router = express.Router();

// Prisma ORM
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

// Middlewares de Seguridad (IAM)
const { verificarSesion, soloAdmin } = require('../middlewares/auth.middleware');

// ==========================================
// RUTAS DE EVENTOS PRIVADOS Y RESERVAS VIP
// ==========================================

/**
 * @route   POST /api/eventos
 * @desc    Recibe una nueva solicitud de reserva desde la página web pública.
 * @access  Público (Cualquier cliente puede solicitar)
 * @param   {Object} req - Objeto de petición HTTP.
 * @param   {Object} req.body - Cuerpo de la petición que contiene los detalles de la reserva.
 * @param   {Object} res - Objeto de respuesta HTTP.
 * @returns {Object} JSON indicando el estado de la creación de la reserva.
 */
router.post('/eventos', async (req, res) => {
    try {
        // Extraemos todos los datos pertinentes enviados en la petición
        const { nombre, telefono, email, fecha, hora, personas, tipo_evento, plan, requerimientos } = req.body;
        
        // 1. Normalización de fechas para el motor de base de datos
        // Prisma requiere objetos Date nativos de JS para hacer las comparaciones correctas
        const fechaReserva = new Date(fecha);

        // 2. Regla de Negocio: Verificación de colisión de fechas
        // Buscamos si ya existe un evento en la misma fecha que NO haya sido rechazado
        const check = await prisma.eventos_privados.findFirst({
            where: {
                fecha_evento: fechaReserva,
                estado: {
                    not: 'Rechazado'
                }
            }
        });

        // Si ya hay una reserva activa para esa fecha, denegamos la solicitud
        if (check) {
            return res.status(400).json({ success: false, error: 'La fecha seleccionada ya se encuentra reservada.' });
        }

        // 3. Persistencia de la nueva solicitud
        // Guardamos los detalles del evento con un estado inicial "Pendiente"
        await prisma.eventos_privados.create({
            data: {
                cliente_nombre: nombre,
                cliente_telefono: telefono,
                cliente_email: email,
                fecha_evento: fechaReserva,
                // Concatenamos la fecha y hora para generar un Timestamp válido en la DB
                hora_inicio: new Date(`${fecha}T${hora}:00.000Z`), 
                // Aseguramos que la cantidad de personas se almacene como texto si así lo requiere el esquema
                cantidad_personas: personas.toString(),
                tipo_plan: plan,
                extras_seleccionados: requerimientos || 'Sin requerimientos',
                tipo_evento: tipo_evento,
                estado: 'Pendiente'
            }
        });
        
        // Retornamos un mensaje de éxito al frontend
        res.json({ success: true, mensaje: 'Solicitud de evento enviada exitosamente al sistema.' });
    } catch (error) { 
        // Logueamos cualquier falla en consola para realizar un posterior seguimiento
        console.error("[ERROR] Error al registrar evento:", error);
        // Respondemos con un estado 500 para errores internos
        res.status(500).json({ success: false, error: 'Error interno al procesar la reserva.' }); 
    }
});

/**
 * @route   GET /api/eventos/lista
 * @desc    Obtiene el cronograma completo de eventos ordenado cronológicamente.
 * @access  Privado (Requiere sesión activa del personal)
 * @param   {Object} req - Objeto de petición HTTP.
 * @param   {Object} res - Objeto de respuesta HTTP.
 * @returns {Array} Lista en formato JSON con los eventos privados.
 */
router.get('/eventos/lista', verificarSesion, async (req, res) => {
    try { 
        // Solicitamos todos los eventos y los ordenamos de manera ascendente por su fecha
        const eventos = await prisma.eventos_privados.findMany({
            orderBy: { fecha_evento: 'asc' }
        });
        
        // Devolvemos el array de eventos
        res.json(eventos); 
    } catch (error) { 
        // Notificamos si algo falla al momento de consultar la base de datos
        res.status(500).json({ error: 'Error de servidor al obtener el cronograma de eventos.' }); 
    }
});

/**
 * @route   PUT /api/eventos/:id/estado
 * @desc    Actualiza el ciclo de vida de una reserva (Pendiente -> Confirmado -> Finalizado/Rechazado).
 * @access  Privado y Estricto (Solo Administradores pueden aprobar o rechazar)
 * @param   {Object} req - Objeto de petición HTTP.
 * @param   {Object} res - Objeto de respuesta HTTP.
 * @returns {Object} JSON informando si el cambio de estado fue exitoso.
 */
router.put('/eventos/:id/estado', verificarSesion, soloAdmin, async (req, res) => {
    try { 
        // Parseamos el parámetro 'id' a un número entero
        const id = parseInt(req.params.id);
        // Recuperamos el nuevo estado provisto en el cuerpo
        const { estado } = req.body;

        // Actualizamos el registro de la base de datos con el estado deseado
        await prisma.eventos_privados.update({
            where: { id: id },
            data: { estado: estado }
        });

        // Respondemos confirmando la actualización
        res.json({ success: true, mensaje: `El estado del evento ha sido actualizado a: ${estado}` }); 
    } catch (error) { 
        // Manejamos cualquier error posible indicando fallo
        res.status(500).json({ error: 'Fallo al intentar actualizar el estado de la reserva.' }); 
    }
});

module.exports = router;