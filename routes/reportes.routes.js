const express = require('express');
const router = express.Router();

// Middlewares de Seguridad (IAM)
const { verificarSesion, soloAdmin } = require('../middlewares/auth.middleware');

// Controladores de Negocio
const { 
    getDashboardStats, 
    getHistorialCierres, 
    eliminarCierre 
} = require('../controllers/reportes.controller');

// ==========================================
// RUTAS DE ANALÍTICA Y REPORTES FINANCIEROS
// ==========================================

/**
 * @route   GET /api/analytics/dashboard
 * @desc    Extrae las métricas de BI (Rendimiento por mesa, top productos, flujo de caja).
 * @access  Privado y Estricto (Solo Gerencia/Administradores)
 */
router.get('/analytics/dashboard', verificarSesion, soloAdmin, getDashboardStats);

/**
 * @route   GET /api/reportes/historial
 * @desc    Obtiene la bitácora histórica de todos los cierres de caja.
 * @access  Privado y Estricto (Solo Gerencia/Administradores)
 */
router.get('/reportes/historial', verificarSesion, soloAdmin, getHistorialCierres);

/**
 * @route   DELETE /api/reportes/eliminar/:id
 * @desc    Anula un cierre de caja específico y registra la acción en auditoría.
 * @access  Privado y Estricto (Solo Gerencia/Administradores)
 */
router.delete('/reportes/eliminar/:id', verificarSesion, soloAdmin, eliminarCierre);

module.exports = router;