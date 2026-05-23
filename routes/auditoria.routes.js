const express = require('express');
const router = express.Router();

// Controladores
const { obtenerRegistrosAuditoria } = require('../controllers/auditoria.controller');

// Middlewares de Seguridad (IAM)
const { verificarSesion, soloAdmin } = require('../middlewares/auth.middleware');

// ==========================================
// RUTAS DE AUDITORÍA (MÓDULO DE SEGURIDAD)
// ==========================================

/**
 * @route   GET /api/auditoria
 * @desc    Obtiene la bitácora de eventos críticos del sistema (Canjes, anulaciones, etc.)
 * @access  Privado (Estricto: Solo Gerencia/Admin)
 */
router.get(
    '/', 
    verificarSesion, // Capa 1: ¿Tienes un token válido?
    soloAdmin,       // Capa 2: ¿Tu token dice que eres 'admin'?
    obtenerRegistrosAuditoria
);

module.exports = router;