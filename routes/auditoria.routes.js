const express = require('express');
const router = express.Router();
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

// Controladores
const { obtenerRegistrosAuditoria } = require('../controllers/auditoria.controller');

// Middlewares de Seguridad (IAM)
const { verificarSesion, soloAdmin } = require('../middlewares/auth.middleware');

// ==========================================
// RUTAS DE AUDITORÍA (MÓDULO DE SEGURIDAD)
// ==========================================

/**
 * @route   GET /api/auditoria
 * @desc    Obtiene la bitácora de eventos críticos del sistema.
 * @access  Privado (Solo Gerencia/Admin)
 * @returns {Array} Lista de registros de auditoría.
 */
router.get(
    '/',
    verificarSesion,
    soloAdmin,
    obtenerRegistrosAuditoria
);

/**
 * @route   POST /api/auditoria/registrar
 * @desc    Registra un evento de auditoría desde el frontend (por cualquier empleado autenticado).
 * @access  Privado
 * @param   {Object} req - Objeto de petición HTTP.
 * @param   {Object} req.body - Cuerpo de la petición.
 * @param   {string} req.body.accion - La acción ejecutada a registrar.
 * @param   {string} [req.body.detalles] - Detalles adicionales del evento.
 * @param   {Object} res - Objeto de respuesta HTTP.
 * @returns {Object} Un objeto JSON indicando el éxito de la operación.
 */
router.post('/registrar', verificarSesion, async (req, res) => {
    try {
        // Extraemos la acción y detalles enviados en el cuerpo de la petición
        const { accion, detalles } = req.body;
        
        // Verificamos que la acción esté presente, de lo contrario retornamos un error
        if (!accion) return res.status(400).json({ error: 'Acción requerida' });

        // Insertamos el nuevo registro de auditoría en la base de datos
        await prisma.auditoria.create({
            data: {
                // Asignamos el ID del usuario si está presente en la sesión, sino nulo
                usuario_id: req.usuario?.id || null,
                // Limitamos la cadena de la acción a 100 caracteres por seguridad
                accion: String(accion).substring(0, 100),
                // Parseamos los detalles a string si existen
                detalles: detalles ? String(detalles) : null
            }
        });

        // Respondemos con éxito
        res.json({ success: true });
    } catch (error) {
        // Registramos el error en la consola del servidor para diagnóstico
        console.error('[AUDITORIA] Error al registrar evento:', error.message);
        // Retornamos un error HTTP 500 informando al cliente
        res.status(500).json({ error: 'Error al registrar evento.' });
    }
});

module.exports = router;