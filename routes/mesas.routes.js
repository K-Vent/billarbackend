/**
 * @file mesas.routes.js
 * @description Rutas para la gestión de mesas, cuentas y el KDS (Kitchen Display System).
 * Contiene endpoints para abrir, cerrar, transferir y administrar mesas y cuentas.
 */

const express = require('express');
const router = express.Router();

// Middlewares de Seguridad (IAM)
// Importa funciones para asegurar que las peticiones estén autenticadas y autorizadas
const { verificarSesion, soloAdmin } = require('../middlewares/auth.middleware');

// Controladores de Negocio
// Importa las funciones lógicas para procesar operaciones relacionadas con las mesas
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
 *          La ruta requiere autenticación de los empleados.
 * @access  Privado (Cualquier empleado autenticado)
 * @function
 * @param {string} path - Ruta del endpoint.
 * @param {Function} middleware - Middleware de verificación de sesión.
 * @param {Function} handler - Controlador para obtener y enviar la lista de mesas.
 */
router.get('/', verificarSesion, obtenerMesas);

/**
 * @route   POST /api/mesas/abrir/:id
 * @desc    Inicia el contador de tiempo o cambia el estado a ocupado para una mesa específica.
 * @access  Privado
 * @function
 * @param {string} path - Ruta del endpoint con el parámetro de ID de la mesa.
 * @param {Function} middleware - Middleware de autenticación.
 * @param {Function} handler - Controlador que maneja la apertura de la mesa.
 */
router.post('/abrir/:id', verificarSesion, abrirMesa);

/**
 * @route   GET /api/mesas/detalle/:id
 * @desc    Carga el detalle de la cuenta de una mesa (tiempo transcurrido y productos consumidos).
 * @access  Privado
 * @function
 * @param {string} path - Ruta del endpoint con el parámetro de ID de la mesa.
 * @param {Function} middleware - Middleware de autenticación.
 * @param {Function} handler - Controlador para consultar los detalles y consumos de la mesa.
 */
router.get('/detalle/:id', verificarSesion, detalleMesa);

/**
 * @route   POST /api/mesas/cerrar/:id
 * @desc    Finaliza la sesión de la mesa, procesa el cobro general y libera el espacio.
 * @access  Privado
 * @function
 * @param {string} path - Ruta con el ID de la mesa a cerrar.
 * @param {Function} middleware - Middleware de autenticación.
 * @param {Function} handler - Controlador que realiza el cierre de la cuenta.
 */
router.post('/cerrar/:id', verificarSesion, cerrarMesa);

/**
 * @route   POST /api/mesas/cambiar
 * @desc    Transfiere el tiempo y los productos consumidos de una mesa a otra.
 * @access  Privado
 * @function
 * @param {string} path - Ruta del endpoint.
 * @param {Function} middleware - Middleware de autenticación.
 * @param {Function} handler - Controlador encargado de la transferencia de mesa.
 */
router.post('/cambiar', verificarSesion, cambiarMesa);


// ==========================================
// GESTIÓN DE CUENTAS DIVIDIDAS
// ==========================================

/**
 * @route   GET /api/mesas/:id/nombres
 * @desc    Obtiene la lista de personas distintas que tienen pedidos pendientes en una mesa.
 *          Se utiliza para manejar cuentas separadas en la misma mesa.
 * @access  Privado
 * @function
 * @param {string} path - Ruta del endpoint con el ID de la mesa.
 * @param {Function} middleware - Middleware de autenticación.
 * @param {Function} handler - Controlador para obtener los nombres asociados a la mesa.
 */
router.get('/:id/nombres', verificarSesion, obtenerNombresMesa);

/**
 * @route   POST /api/mesas/cerrar-personal/:id
 * @desc    Cobra y libera exclusivamente los productos asociados a una persona específica en una mesa.
 * @access  Privado
 * @function
 * @param {string} path - Ruta del endpoint con el ID de la mesa.
 * @param {Function} middleware - Middleware de autenticación.
 * @param {Function} handler - Controlador para procesar el pago parcial.
 */
router.post('/cerrar-personal/:id', verificarSesion, cerrarCuentaPersonal);


// ==========================================
// INFRAESTRUCTURA FÍSICA (ADMINISTRACIÓN)
// ==========================================

/**
 * @route   POST /api/mesas/crear
 * @desc    Añade una nueva mesa al entorno físico del restaurante en la base de datos.
 * @access  Privado y Estricto (Solo Administradores/Gerencia)
 * @function
 * @param {string} path - Ruta del endpoint.
 * @param {Function} middleware1 - Verifica sesión activa.
 * @param {Function} middleware2 - Verifica si el usuario tiene privilegios de administrador.
 * @param {Function} handler - Controlador que registra una nueva mesa.
 */
router.post('/crear', verificarSesion, soloAdmin, crearMesa);

/**
 * @route   DELETE /api/mesas/eliminar-ultima
 * @desc    Retira la última mesa del sistema (solo permitido si se encuentra libre).
 * @access  Privado y Estricto (Solo Administradores/Gerencia)
 * @function
 * @param {string} path - Ruta del endpoint.
 * @param {Function} middleware1 - Verifica sesión activa.
 * @param {Function} middleware2 - Verifica privilegios de administrador.
 * @param {Function} handler - Controlador para eliminar la mesa más recientemente añadida.
 */
router.delete('/eliminar-ultima', verificarSesion, soloAdmin, eliminarUltimaMesa);

// Exporta el módulo de rutas para utilizarse en el servidor
module.exports = router;