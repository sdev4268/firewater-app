const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { PrismaClient } = require('@prisma/client');

const router = express.Router();
const prisma = new PrismaClient();

// POST /api/auth/login
router.post('/login', async (req, res) => {
  const { employeeId, password } = req.body;
  if (!employeeId || !password) {
    return res.status(400).json({ error: 'Employee ID and password are required' });
  }
  try {
    const user = await prisma.user.findUnique({ where: { employeeId } });
    if (!user) return res.status(401).json({ error: 'Invalid credentials' });

    const valid = await bcrypt.compare(password, user.passwordHash);
    if (!valid) return res.status(401).json({ error: 'Invalid credentials' });

    const token = jwt.sign(
      { id: user.id, employeeId: user.employeeId, name: user.name, role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: '8h' }
    );
    res.json({ token, user: { id: user.id, employeeId: user.employeeId, name: user.name, role: user.role } });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/auth/logout
router.post('/logout', (req, res) => {
  res.json({ message: 'Logged out' });
});

module.exports = router;