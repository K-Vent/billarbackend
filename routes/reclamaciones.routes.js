const express = require('express');
const router = express.Router();
const reclamacionesController = require('../controllers/reclamaciones.controller');

// Rutas Públicas (Cualquiera puede enviar un reclamo)
router.post('/', reclamacionesController.createReclamacion);

// Rutas Privadas (Requiere middleware de auth en el frontend)
router.get('/', reclamacionesController.getReclamaciones);
router.put('/:id', reclamacionesController.updateReclamacion);

module.exports = router;
