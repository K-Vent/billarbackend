/**
 * @file notificaciones.routes.js
 * @description Rutas para la gestión y obtención de notificaciones del sistema.
 */

const express = require('express');
const router = express.Router();

// Controlador que contiene la lógica para manejar las notificaciones
const notificacionesController = require('../controllers/notificaciones.controller');

/**
 * @route   GET /api/notificaciones
 * @desc    Obtiene la lista de notificaciones recientes.
 *          Nota: Requiere estar autenticado en el frontend (idealmente debería tener un middleware de autenticación,
 *          pero por ahora sigue la convención actual).
 * @access  Privado (Idealmente)
 * @function
 * @param {string} path - Ruta del endpoint.
 * @param {Function} handler - Controlador que devuelve las notificaciones.
 */
router.get('/', notificacionesController.getNotificaciones);

// Exporta el módulo de rutas para utilizarse en la aplicación principal
module.exports = router;
