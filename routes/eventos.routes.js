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
 */
router.post('/eventos', async (req, res) => {
    try {
        const { nombre, telefono, email, fecha, hora, personas, tipo_evento, plan, requerimientos } = req.body;
        
        // 1. Normalización de fechas para el motor de base de datos
        // Prisma requiere objetos Date nativos de JS para hacer las comparaciones correctas
        const fechaReserva = new Date(fecha);

        // 2. Regla de Negocio: Verificación de colisión de fechas
        // Buscamos si ya existe un evento ese día que NO esté rechazado
        const check = await prisma.eventos_privados.findFirst({
            where: {
                fecha_evento: fechaReserva,
                estado: {
                    not: 'Rechazado'
                }
            }
        });

        if (check) {
            return res.status(400).json({ success: false, error: 'La fecha seleccionada ya se encuentra reservada.' });
        }

        // 3. Persistencia de la nueva solicitud
        await prisma.eventos_privados.create({
            data: {
                cliente_nombre: nombre,
                cliente_telefono: telefono,
                cliente_email: email,
                fecha_evento: fechaReserva,
                // Concatenamos la fecha y hora para generar un Timestamp válido en la DB
                hora_inicio: new Date(`${fecha}T${hora}:00.000Z`), 
                cantidad_personas: personas.toString(),
                tipo_plan: plan,
                extras_seleccionados: requerimientos || 'Sin requerimientos',
                tipo_evento: tipo_evento,
                estado: 'Pendiente'
            }
        });
        
        res.json({ success: true, mensaje: 'Solicitud de evento enviada exitosamente al sistema.' });
    } catch (error) { 
        console.error("[ERROR] Error al registrar evento:", error);
        res.status(500).json({ success: false, error: 'Error interno al procesar la reserva.' }); 
    }
});

/**
 * @route   GET /api/eventos/lista
 * @desc    Obtiene el cronograma completo de eventos ordenado cronológicamente.
 * @access  Privado (Requiere sesión activa del personal)
 */
router.get('/eventos/lista', verificarSesion, async (req, res) => {
    try { 
        const eventos = await prisma.eventos_privados.findMany({
            orderBy: { fecha_evento: 'asc' }
        });
        res.json(eventos); 
    } catch (error) { 
        res.status(500).json({ error: 'Error de servidor al obtener el cronograma de eventos.' }); 
    }
});

/**
 * @route   PUT /api/eventos/:id/estado
 * @desc    Actualiza el ciclo de vida de una reserva (Pendiente -> Confirmado -> Finalizado/Rechazado).
 * @access  Privado y Estricto (Solo Administradores pueden aprobar o rechazar)
 */
router.put('/eventos/:id/estado', verificarSesion, soloAdmin, async (req, res) => {
    try { 
        const id = parseInt(req.params.id);
        const { estado } = req.body;

        await prisma.eventos_privados.update({
            where: { id: id },
            data: { estado: estado }
        });

        res.json({ success: true, mensaje: `El estado del evento ha sido actualizado a: ${estado}` }); 
    } catch (error) { 
        res.status(500).json({ error: 'Fallo al intentar actualizar el estado de la reserva.' }); 
    }
});

module.exports = router;