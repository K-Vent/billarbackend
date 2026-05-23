const express = require('express');
const router = express.Router();

// Middlewares de Seguridad (IAM)
const { verificarSesion, soloAdmin } = require('../middlewares/auth.middleware');

// Controladores de Negocio
const { 
    obtenerMesas, 
    abrirMesa, 
    detalleMesa, 
    cerrarMesa, 
    cambiarMesa,
    crearMesa, 
    eliminarUltimaMesa,
    cerrarCuentaPersonal,
    obtenerNombresMesa
} = require('../controllers/mesas.controller');

// ==========================================
// RUTAS OPERATIVAS DE MESAS Y KDS
// ==========================================

/**
 * @route   GET /api/mesas
 * @desc    Obtiene el layout actual y el estado en tiempo real de todas las mesas.
 * @access  Privado (Cualquier empleado autenticado)
 */
router.get('/', verificarSesion, obtenerMesas);

/**
 * @route   POST /api/mesas/abrir/:id
 * @desc    Inicia el contador de tiempo o cambia el estado a ocupado.
 * @access  Privado
 */
router.post('/abrir/:id', verificarSesion, abrirMesa);

/**
 * @route   GET /api/mesas/detalle/:id
 * @desc    Carga la cuenta de una mesa (tiempo transcurrido + productos consumidos).
 * @access  Privado
 */
router.get('/detalle/:id', verificarSesion, detalleMesa);

/**
 * @route   POST /api/mesas/cerrar/:id
 * @desc    Finaliza la sesión de la mesa, procesa el cobro general y libera el espacio.
 * @access  Privado
 */
router.post('/cerrar/:id', verificarSesion, cerrarMesa);

/**
 * @route   POST /api/mesas/cambiar
 * @desc    Transfiere el tiempo y los productos de una mesa a otra.
 * @access  Privado
 */
router.post('/cambiar', verificarSesion, cambiarMesa);


// ==========================================
// GESTIÓN DE CUENTAS DIVIDIDAS
// ==========================================

/**
 * @route   GET /api/mesas/:id/nombres
 * @desc    Obtiene la lista de personas distintas que tienen pedidos pendientes en una mesa.
 * @access  Privado
 */
router.get('/:id/nombres', verificarSesion, obtenerNombresMesa);

/**
 * @route   POST /api/mesas/cerrar-personal/:id
 * @desc    Cobra y libera exclusivamente los productos asociados a una persona específica.
 * @access  Privado
 */
router.post('/cerrar-personal/:id', verificarSesion, cerrarCuentaPersonal);


// ==========================================
// INFRAESTRUCTURA FÍSICA (ADMINISTRACIÓN)
// ==========================================

/**
 * @route   POST /api/mesas/crear
 * @desc    Añade una nueva mesa al entorno físico del restaurante.
 * @access  Privado y Estricto (Solo Administradores/Gerencia)
 */
router.post('/crear', verificarSesion, soloAdmin, crearMesa);

/**
 * @route   DELETE /api/mesas/eliminar-ultima
 * @desc    Retira la última mesa del sistema (solo si está libre).
 * @access  Privado y Estricto (Solo Administradores/Gerencia)
 */
router.delete('/eliminar-ultima', verificarSesion, soloAdmin, eliminarUltimaMesa);

module.exports = router;