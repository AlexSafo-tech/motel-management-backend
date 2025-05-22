// middleware/validation.js - Middleware para validação de dados

// Validação de email
const isValidEmail = (email) => {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
};

// Validação de telefone (formato brasileiro)
const isValidPhone = (phone) => {
  const phoneRegex = /^(\+55\s?)?(\d{2}\s?)?\d{4,5}-?\d{4}$/;
  return phoneRegex.test(phone.replace(/\s/g, ''));
};

// Validação de CPF
const isValidCPF = (cpf) => {
  cpf = cpf.replace(/[^\d]/g, '');
  
  if (cpf.length !== 11 || /^(\d)\1{10}$/.test(cpf)) {
    return false;
  }

  let sum = 0;
  for (let i = 0; i < 9; i++) {
    sum += parseInt(cpf.charAt(i)) * (10 - i);
  }
  let digit1 = 11 - (sum % 11);
  if (digit1 === 10 || digit1 === 11) digit1 = 0;

  sum = 0;
  for (let i = 0; i < 10; i++) {
    sum += parseInt(cpf.charAt(i)) * (11 - i);
  }
  let digit2 = 11 - (sum % 11);
  if (digit2 === 10 || digit2 === 11) digit2 = 0;

  return digit1 === parseInt(cpf.charAt(9)) && digit2 === parseInt(cpf.charAt(10));
};

// Validação de senha forte
const isStrongPassword = (password) => {
  const minLength = 6;
  const hasUpperCase = /[A-Z]/.test(password);
  const hasLowerCase = /[a-z]/.test(password);
  const hasNumbers = /\d/.test(password);
  
  return password.length >= minLength && (hasUpperCase || hasLowerCase) && hasNumbers;
};

// Middleware para validar dados de usuário
const validateUser = (req, res, next) => {
  const { name, email, password, phone } = req.body;
  const errors = [];

  // Validar nome
  if (!name || name.trim().length < 2) {
    errors.push('Nome deve ter pelo menos 2 caracteres');
  }

  // Validar email
  if (email && !isValidEmail(email)) {
    errors.push('Email deve ter formato válido');
  }

  // Validar senha (apenas em criação ou alteração)
  if (password && !isStrongPassword(password)) {
    errors.push('Senha deve ter pelo menos 6 caracteres, incluindo letras e números');
  }

  // Validar telefone
  if (phone && !isValidPhone(phone)) {
    errors.push('Telefone deve ter formato válido');
  }

  if (errors.length > 0) {
    return res.status(400).json({
      success: false,
      message: 'Dados inválidos',
      errors
    });
  }

  next();
};

// Middleware para validar dados de cliente
const validateCustomer = (req, res, next) => {
  const { name, email, phone, document, documentType } = req.body;
  const errors = [];

  // Validar nome
  if (!name || name.trim().length < 2) {
    errors.push('Nome deve ter pelo menos 2 caracteres');
  }

  // Validar email (opcional)
  if (email && !isValidEmail(email)) {
    errors.push('Email deve ter formato válido');
  }

  // Validar telefone
  if (!phone || !isValidPhone(phone)) {
    errors.push('Telefone é obrigatório e deve ter formato válido');
  }

  // Validar documento
  if (document && documentType === 'CPF' && !isValidCPF(document)) {
    errors.push('CPF deve ter formato válido');
  }

  if (errors.length > 0) {
    return res.status(400).json({
      success: false,
      message: 'Dados inválidos',
      errors
    });
  }

  next();
};

// Middleware para validar dados de quarto
const validateRoom = (req, res, next) => {
  const { number, type, capacity, pricing } = req.body;
  const errors = [];

  // Validar número do quarto
  if (!number || number.toString().trim().length === 0) {
    errors.push('Número do quarto é obrigatório');
  }

  // Validar tipo
  const validTypes = ['Standard', 'Premium', 'Suite', 'Luxo'];
  if (type && !validTypes.includes(type)) {
    errors.push(`Tipo deve ser um dos seguintes: ${validTypes.join(', ')}`);
  }

  // Validar capacidade
  if (capacity && (capacity < 1 || capacity > 6)) {
    errors.push('Capacidade deve ser entre 1 e 6 pessoas');
  }

  // Validar preços
  if (pricing) {
    if (pricing.hourly && pricing.hourly < 0) {
      errors.push('Preço por hora deve ser positivo');
    }
    if (pricing.period4h && pricing.period4h < 0) {
      errors.push('Preço por 4h deve ser positivo');
    }
    if (pricing.period12h && pricing.period12h < 0) {
      errors.push('Preço por 12h deve ser positivo');
    }
    if (pricing.daily && pricing.daily < 0) {
      errors.push('Preço diário deve ser positivo');
    }
  }

  if (errors.length > 0) {
    return res.status(400).json({
      success: false,
      message: 'Dados inválidos',
      errors
    });
  }

  next();
};

// Middleware para validar dados de reserva
const validateReservation = (req, res, next) => {
  const { roomId, customerId, checkIn, checkOut, periodType, guests } = req.body;
  const errors = [];

  // Validar IDs obrigatórios
  if (!roomId) {
    errors.push('ID do quarto é obrigatório');
  }

  if (!customerId) {
    errors.push('ID do cliente é obrigatório');
  }

  // Validar datas
  if (!checkIn) {
    errors.push('Data/hora de check-in é obrigatória');
  }

  if (!checkOut) {
    errors.push('Data/hora de check-out é obrigatória');
  }

  if (checkIn && checkOut) {
    const checkInDate = new Date(checkIn);
    const checkOutDate = new Date(checkOut);
    
    if (checkInDate >= checkOutDate) {
      errors.push('Data de check-out deve ser posterior ao check-in');
    }

    if (checkInDate < new Date()) {
      errors.push('Data de check-in não pode ser no passado');
    }
  }

  // Validar tipo de período
  const validPeriods = ['hourly', '4h', '12h', 'daily', 'custom'];
  if (periodType && !validPeriods.includes(periodType)) {
    errors.push(`Tipo de período deve ser um dos seguintes: ${validPeriods.join(', ')}`);
  }

  // Validar hóspedes
  if (guests) {
    if (guests.adults && guests.adults < 1) {
      errors.push('Deve haver pelo menos 1 adulto');
    }
    if (guests.children && guests.children < 0) {
      errors.push('Número de crianças não pode ser negativo');
    }
  }

  if (errors.length > 0) {
    return res.status(400).json({
      success: false,
      message: 'Dados inválidos',
      errors
    });
  }

  next();
};

// Middleware para validar dados de produto
const validateProduct = (req, res, next) => {
  const { name, category, pricing, inventory } = req.body;
  const errors = [];

  // Validar nome
  if (!name || name.trim().length < 2) {
    errors.push('Nome do produto deve ter pelo menos 2 caracteres');
  }

  // Validar categoria
  if (!category) {
    errors.push('Categoria é obrigatória');
  }

  // Validar preços
  if (pricing) {
    if (pricing.cost !== undefined && pricing.cost < 0) {
      errors.push('Custo deve ser positivo');
    }
    if (pricing.price !== undefined && pricing.price < 0) {
      errors.push('Preço deve ser positivo');
    }
    if (pricing.cost && pricing.price && pricing.price < pricing.cost) {
      errors.push('Preço deve ser maior que o custo');
    }
  }

  // Validar estoque
  if (inventory) {
    if (inventory.currentStock !== undefined && inventory.currentStock < 0) {
      errors.push('Estoque atual não pode ser negativo');
    }
    if (inventory.minStock !== undefined && inventory.minStock < 0) {
      errors.push('Estoque mínimo não pode ser negativo');
    }
  }

  if (errors.length > 0) {
    return res.status(400).json({
      success: false,
      message: 'Dados inválidos',
      errors
    });
  }

  next();
};

// Middleware para validar dados de pedido
const validateOrder = (req, res, next) => {
  const { reservationId, items } = req.body;
  const errors = [];

  // Validar reserva
  if (!reservationId) {
    errors.push('ID da reserva é obrigatório');
  }

  // Validar itens
  if (!items || !Array.isArray(items) || items.length === 0) {
    errors.push('Pedido deve conter pelo menos um item');
  }

  if (items && Array.isArray(items)) {
    items.forEach((item, index) => {
      if (!item.productId) {
        errors.push(`Item ${index + 1}: ID do produto é obrigatório`);
      }
      if (!item.quantity || item.quantity < 1) {
        errors.push(`Item ${index + 1}: Quantidade deve ser pelo menos 1`);
      }
    });
  }

  if (errors.length > 0) {
    return res.status(400).json({
      success: false,
      message: 'Dados inválidos',
      errors
    });
  }

  next();
};

// Middleware genérico para sanitizar dados
const sanitizeInput = (req, res, next) => {
  const sanitize = (obj) => {
    for (let key in obj) {
      if (typeof obj[key] === 'string') {
        obj[key] = obj[key].trim();
      } else if (typeof obj[key] === 'object' && obj[key] !== null) {
        sanitize(obj[key]);
      }
    }
  };

  if (req.body) {
    sanitize(req.body);
  }

  next();
};

module.exports = {
  validateUser,
  validateCustomer,
  validateRoom,
  validateReservation,
  validateProduct,
  validateOrder,
  sanitizeInput,
  isValidEmail,
  isValidPhone,
  isValidCPF,
  isStrongPassword
};
