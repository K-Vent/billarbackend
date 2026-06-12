/**
 * @fileoverview Rutas para analítica, reportes financieros y auditoría de la aplicación.
 * Agrupa todos los endpoints necesarios para visualizar métricas, historial y cierres.
 */

const express = require('express');
const router = express.Router();

// Importar Middlewares de Seguridad (IAM) para controlar el acceso a nivel de ruta
const { verificarSesion, soloAdmin } = require('../middlewares/auth.middleware');

// Importar Controladores de Negocio para la generación y gestión de reportes
const { 
    getDashboardStats, 
    getHistorialCierres, 
    eliminarCierre 
} = require('../controllers/reportes.controller');

// ==========================================
// RUTAS DE ANALÍTICA Y REPORTES FINANCIEROS
// ==========================================

/**
 * Endpoint para obtener métricas principales del negocio.
 * @route   GET /api/analytics/dashboard
 * @desc    Extrae las métricas de BI (Rendimiento por mesa, top de productos más vendidos, flujo de caja, etc).
 * @access  Privado y Estricto (Solo Gerencia/Administradores)
 * @returns {Object} Estadísticas consolidadas para pintar el dashboard interactivo
 */
router.get('/analytics/dashboard', verificarSesion, soloAdmin, getDashboardStats);

/**
 * Endpoint para visualizar la bitácora de cierres.
 * @route   GET /api/reportes/historial
 * @desc    Obtiene la bitácora histórica de todos los cierres de caja registrados en el sistema, permitiendo revisiones.
 * @access  Privado y Estricto (Solo Gerencia/Administradores)
 * @returns {Array} Lista detallada de cierres de caja realizados
 */
router.get('/reportes/historial', verificarSesion, soloAdmin, getHistorialCierres);

/**
 * Endpoint para anular un cierre de caja.
 * @route   DELETE /api/reportes/eliminar/:id
 * @desc    Anula un cierre de caja específico y registra obligatoriamente la acción en la tabla de auditoría por motivos de seguridad.
 * @access  Privado y Estricto (Solo Gerencia/Administradores)
 * @param   {string} id - Identificador único del cierre a eliminar
 */
router.delete('/reportes/eliminar/:id', verificarSesion, soloAdmin, eliminarCierre);

// Exportar el enrutador configurado para su uso en la aplicación principal
module.exports = router;