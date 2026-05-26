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
 */
router.post('/registrar', verificarSesion, async (req, res) => {
    try {
        const { accion, detalles } = req.body;
        if (!accion) return res.status(400).json({ error: 'Acción requerida' });

        await prisma.auditoria.create({
            data: {
                usuario_id: req.usuario?.id || null,
                accion: String(accion).substring(0, 100),
                detalles: detalles ? String(detalles) : null
            }
        });

        res.json({ success: true });
    } catch (error) {
        console.error('[AUDITORIA] Error al registrar evento:', error.message);
        res.status(500).json({ error: 'Error al registrar evento.' });
    }
});

module.exports = router;