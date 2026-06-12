/**
 * @fileoverview Rutas para el módulo VIP y programa de fidelidad.
 * Engloba toda la gestión de clientes, autenticación VIP, escaneo QR y reglas de beneficios.
 */

const express = require('express');
const router = express.Router();
const rateLimit = require('express-rate-limit');

// Implementación de limitador de peticiones para proteger el inicio de sesión VIP contra ataques de fuerza bruta.
// Este middleware es crucial para la seguridad pública.
const vipLoginLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // Ventana de bloqueo durante 15 minutos
    max: 5, // Límite estricto de 5 intentos fallidos
    message: { error: "Demasiados intentos fallidos. Por seguridad, intente más tarde." }
});

// Importar Middlewares de Seguridad (IAM) para validar tokens y restringir accesos
const { verificarSesion, soloAdmin } = require('../middlewares/auth.middleware');

// Importar Controladores de Negocio asociados al flujo completo del módulo VIP
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
 * Endpoint para listar el padrón completo de socios.
 * @route   GET /api/clientes
 * @desc    Obtiene el padrón de socios VIP, usualmente ordenado por nivel de fidelidad para seguimiento interno.
 * @access  Privado (Cualquier empleado autenticado)
 */
router.get('/clientes', verificarSesion, obtenerClientes);

/**
 * Endpoint para inscribir nuevos clientes al programa.
 * @route   POST /api/clientes/nuevo
 * @desc    Inscribe a un nuevo cliente en el programa de fidelización, inicializando sus contadores y beneficios de base.
 * @access  Privado (Requiere sesión de empleado)
 */
router.post('/clientes/nuevo', verificarSesion, registrarCliente);

/**
 * Endpoint para agregar un sello (visita o consumo válido).
 * @route   POST /api/clientes/:id/sello
 * @desc    Registra una nueva visita o consumo del cliente. Dispara un recálculo dinámico del nivel del socio si se alcanzan umbrales.
 * @access  Privado
 * @param   {string} id - Identificador del cliente
 */
router.post('/clientes/:id/sello', verificarSesion, agregarSello);

/**
 * Endpoint para solicitar el canje de un premio por fidelidad.
 * @route   POST /api/clientes/:id/canjear
 * @desc    Valida que el cliente posea los fondos de fidelidad necesarios y aprueba el uso de un premio, descontando los puntos/sellos correspondientes.
 * @access  Privado
 * @param   {string} id - Identificador del cliente
 */
router.post('/clientes/:id/canjear', verificarSesion, canjearPremio);

/**
 * Endpoint para dar de baja a un socio del programa.
 * @route   DELETE /api/clientes/:id
 * @desc    Retira a un socio del programa VIP de forma permanente y purga su registro de beneficios.
 * @access  Privado y Estricto (Solo Gerencia/Administradores)
 * @param   {string} id - Identificador del cliente a eliminar
 */
router.delete('/clientes/:id', verificarSesion, soloAdmin, eliminarCliente);


// ==========================================
// MÓDULO 2: AUTENTICACIÓN VIP Y ESCANEO QR
// ==========================================

/**
 * Endpoint de acceso a la portal de socios para el cliente final.
 * @route   POST /api/vip/login
 * @desc    Autentica al cliente en su propio portal móvil (Web App Pública).
 *          Utiliza un limitador de peticiones (vipLoginLimiter) para mitigación de ataques automáticos.
 * @access  Público
 */
router.post('/vip/login', vipLoginLimiter, loginVip);

/**
 * Endpoint para validar QR de socio en sucursal.
 * @route   GET /api/vip/escanear/:codigo
 * @desc    Decodifica y valida un código QR presentado por el cliente en el local, devolviendo la información completa y confiable del socio.
 * @access  Privado (El empleado escanea el código del cliente mediante un dispositivo del negocio)
 * @param   {string} codigo - Hash o identificador codificado en el QR
 */
router.get('/vip/escanear/:codigo', verificarSesion, escanearQr);

/**
 * Endpoint de canje seguro mediante transacción atómica.
 * @route   POST /api/transaccion/canje-seguro
 * @desc    Ejecuta el canje a través de una transacción atómica. Esto asegura que se descuente el premio al usuario y se abone de inmediato a la cuenta/mesa sin riesgo de fallos parciales (inconsistencias de estado).
 * @access  Privado
 */
router.post('/transaccion/canje-seguro', verificarSesion, canjeSeguroTransaccion);


// ==========================================
// MÓDULO 3: MOTOR DE REGLAS Y BENEFICIOS (CMS)
// ==========================================

/**
 * Endpoint público para consultar la carta de beneficios.
 * @route   GET /api/beneficios
 * @desc    Extrae y muestra la lista de beneficios disponibles de acuerdo a los distintos niveles del programa de lealtad.
 * @access  Público (Orientado a la landing page promocional o el portal del cliente)
 */
router.get('/beneficios', obtenerBeneficios);

/**
 * Endpoint para configurar nuevas reglas de beneficios.
 * @route   POST /api/beneficios
 * @desc    Instancia una nueva regla de beneficio promocional o establece condiciones actualizadas para un nivel determinado del sistema.
 * @access  Privado y Estricto (Solo Gerencia/Administradores)
 */
router.post('/beneficios', verificarSesion, soloAdmin, agregarBeneficio);

/**
 * Endpoint para borrar reglas o beneficios caducos.
 * @route   DELETE /api/beneficios/:id
 * @desc    Elimina definitivamente una regla de beneficio que el negocio ya no desea ofertar en su programa.
 * @access  Privado y Estricto (Solo Gerencia/Administradores)
 * @param   {string} id - Identificador del beneficio a eliminar de la base de datos
 */
router.delete('/beneficios/:id', verificarSesion, soloAdmin, eliminarBeneficio);

// Exportación del enrutador configurado con todas las rutas VIP
module.exports = router;