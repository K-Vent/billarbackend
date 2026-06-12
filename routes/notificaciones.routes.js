const express = require('express');
const router = express.Router();
const notificacionesController = require('../controllers/notificaciones.controller');

// GET /api/notificaciones - Requiere estar autenticado en el frontend (idealmente con middleware, pero seguimos la convención actual)
router.get('/', notificacionesController.getNotificaciones);

module.exports = router;
