const express = require('express');
const router = express.Router();

const { verificarSesion, soloAdmin } = require('../middlewares/auth.middleware');
const { 
    obtenerUsuarios, 
    crearUsuario, 
    cambiarEstadoUsuario, 
    eliminarUsuario 
} = require('../controllers/usuarios.controller');

// ==========================================
// RUTAS DE EMPLEADOS (Solo Admin)
// ==========================================

router.get('/', verificarSesion, soloAdmin, obtenerUsuarios);
router.post('/nuevo', verificarSesion, soloAdmin, crearUsuario);
router.put('/:id/estado', verificarSesion, soloAdmin, cambiarEstadoUsuario);
router.delete('/:id', verificarSesion, soloAdmin, eliminarUsuario);

module.exports = router;