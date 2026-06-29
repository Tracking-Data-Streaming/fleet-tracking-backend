const { Router } = require('express');
const auth = require('../controllers/authController');

const router = Router();

router.post('/login', auth.login);
router.post('/register', auth.register);
router.post('/confirm', auth.confirmSignUp);
router.post('/resend-code', auth.resendCode);

module.exports = router;
