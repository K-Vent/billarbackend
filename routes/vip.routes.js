const express = require('express');
const router = express.Router();

// Middlewares de Seguridad (IAM)
const { verificarSesion, soloAdmin } = require('../middlewares/auth.middleware');

// Controladores de Negocio
const { 
    obtenerClientes, 
    registrarCliente, 
    loginVip, 
    agregarSello, 
    canjearPremio, 
    escanearQr, 
    canjeSeguroTransaccion, 
    obtenerBeneficios, 
    agregarBeneficio, 
    eliminarBeneficio, 
    eliminarCliente 
} = require('../controllers/vip.controller');

// ==========================================
// MÓDULO 1: CRM Y GESTIÓN DE SOCIOS
// ==========================================

/**
 * @route   GET /api/clientes
 * @desc    Obtiene el padrón de socios VIP ordenado por nivel de fidelidad.
 * @access  Privado (Cualquier empleado autenticado)
 */
router.get('/clientes', verificarSesion, obtenerClientes);

/**
 * @route   POST /api/clientes/nuevo
 * @desc    Inscribe a un nuevo cliente en el programa de fidelización.
 * @access  Privado
 */
router.post('/clientes/nuevo', verificarSesion, registrarCliente);

/**
 * @route   POST /api/clientes/:id/sello
 * @desc    Registra una visita/consumo y recalcula el nivel del socio.
 * @access  Privado
 */
router.post('/clientes/:id/sello', verificarSesion, agregarSello);

/**
 * @route   POST /api/clientes/:id/canjear
 * @desc    Verifica los fondos de fidelidad y habilita el uso de un premio.
 * @access  Privado
 */
router.post('/clientes/:id/canjear', verificarSesion, canjearPremio);

/**
 * @route   DELETE /api/clientes/:id
 * @desc    Retira a un socio del programa VIP.
 * @access  Privado y Estricto (Solo Gerencia/Administradores)
 */
router.delete('/clientes/:id', verificarSesion, soloAdmin, eliminarCliente);


// ==========================================
// MÓDULO 2: AUTENTICACIÓN VIP Y ESCANEO QR
// ==========================================

/**
 * @route   POST /api/vip/login
 * @desc    Autentica al cliente en su propio portal móvil (Web App Pública).
 * @access  Público
 */
router.post('/vip/login', loginVip);

/**
 * @route   GET /api/vip/escanear/:codigo
 * @desc    Valida un código QR presentado por el cliente en el local.
 * @access  Privado (El empleado escanea el código del cliente)
 */
router.get('/vip/escanear/:codigo', verificarSesion, escanearQr);

/**
 * @route   POST /api/transaccion/canje-seguro
 * @desc    Ejecuta la transacción atómica de descontar premio y abonar hora en mesa.
 * @access  Privado
 */
router.post('/transaccion/canje-seguro', verificarSesion, canjeSeguroTransaccion);


// ==========================================
// MÓDULO 3: MOTOR DE REGLAS Y BENEFICIOS (CMS)
// ==========================================

/**
 * @route   GET /api/beneficios
 * @desc    Muestra la lista de beneficios disponibles según el nivel.
 * @access  Público (Para mostrar en la landing page / portal del cliente)
 */
router.get('/beneficios', obtenerBeneficios);

/**
 * @route   POST /api/beneficios
 * @desc    Crea una nueva regla de beneficio o nivel en el sistema.
 * @access  Privado y Estricto (Solo Gerencia/Administradores)
 */
router.post('/beneficios', verificarSesion, soloAdmin, agregarBeneficio);

/**
 * @route   DELETE /api/beneficios/:id
 * @desc    Elimina una regla de beneficio existente.
 * @access  Privado y Estricto (Solo Gerencia/Administradores)
 */
router.delete('/beneficios/:id', verificarSesion, soloAdmin, eliminarBeneficio);

module.exports = router;