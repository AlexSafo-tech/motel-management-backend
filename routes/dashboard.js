// routes/dashboard.js - Rotas do dashboard e relatórios

const express = require('express');
const router = express.Router();
const Room = require('../models/Room');
const Reservation = require('../models/Reservation');
const Customer = require('../models/Customer');
const Order = require('../models/Order');
const { Product } = require('../models/Product');
const { authenticate, authorize } = require('../middleware/auth');

// @route   GET /api/dashboard/overview
// @desc    Obter visão geral do dashboard
// @access  Private
router.get('/overview', authenticate, async (req, res) => {
  try {
    const today = new Date();
    const startOfDay = new Date(today.setHours(0, 0, 0, 0));
    const endOfDay = new Date(today.setHours(23, 59, 59, 999));
    const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);

    // Estatísticas de quartos
    const roomStats = {
      total: await Room.countDocuments({ isActive: true }),
      occupied: await Room.countDocuments({ isActive: true, status: 'occupied' }),
      available: await Room.countDocuments({ isActive: true, status: 'available' }),
      cleaning: await Room.countDocuments({ isActive: true, status: 'cleaning' }),
      maintenance: await Room.countDocuments({ isActive: true, status: { $in: ['maintenance', 'out_of_order'] } })
    };

    roomStats.occupancyRate = roomStats.total > 0 ? 
      ((roomStats.occupied / roomStats.total) * 100).toFixed(2) : 0;

    // Reservas ativas e de hoje
    const reservationStats = {
      active: await Reservation.countDocuments({ status: 'checked-in' }),
      todayCheckIns: await Reservation.countDocuments({
        status: { $in: ['confirmed', 'checked-in'] },
        checkIn: { $gte: startOfDay, $lte: endOfDay }
      }),
      todayCheckOuts: await Reservation.countDocuments({
        status: 'checked-out',
        checkOut: { $gte: startOfDay, $lte: endOfDay }
      }),
      pending: await Reservation.countDocuments({ status: 'pending' })
    };

    // Pedidos de hoje
    const orderStats = {
      todayTotal: await Order.countDocuments({
        'timeline.orderedAt': { $gte: startOfDay, $lte: endOfDay }
      }),
      pending: await Order.countDocuments({ status: 'pending' }),
      preparing: await Order.countDocuments({ status: { $in: ['confirmed', 'preparing'] } }),
      ready: await Order.countDocuments({ status: 'ready' }),
      delivered: await Order.countDocuments({
        status: 'delivered',
        'timeline.deliveredAt': { $gte: startOfDay, $lte: endOfDay }
      })
    };

    // Receita do mês
    const monthlyRevenue = await Reservation.aggregate([
      {
        $match: {
          status: 'checked-out',
          checkOut: { $gte: startOfMonth }
        }
      },
      {
        $group: {
          _id: null,
          roomRevenue: { $sum: '$pricing.totalPrice' },
          consumptionRevenue: { $sum: '$consumptionTotal' },
          count: { $sum: 1 }
        }
      }
    ]);

    const orderRevenue = await Order.aggregate([
      {
        $match: {
          status: 'delivered',
          'timeline.deliveredAt': { $gte: startOfMonth }
        }
      },
      {
        $group: {
          _id: null,
          total: { $sum: '$pricing.total' },
          count: { $sum: 1 }
        }
      }
    ]);

    const revenueData = monthlyRevenue[0] || { roomRevenue: 0, consumptionRevenue: 0, count: 0 };
    const orderRevenueData = orderRevenue[0] || { total: 0, count: 0 };

    const totalRevenue = revenueData.roomRevenue + revenueData.consumptionRevenue + orderRevenueData.total;

    // Alertas
    const alerts = [];

    // Quartos precisando de limpeza
    if (roomStats.cleaning > 0) {
      alerts.push({
        type: 'warning',
        message: `${roomStats.cleaning} quarto(s) precisam de limpeza`,
        count: roomStats.cleaning
      });
    }

    // Quartos em manutenção
    if (roomStats.maintenance > 0) {
      alerts.push({
        type: 'error',
        message: `${roomStats.maintenance} quarto(s) em manutenção`,
        count: roomStats.maintenance
      });
    }

    // Pedidos atrasados
    const delayedOrders = await Order.find({
      status: { $in: ['confirmed', 'preparing'] },
      'deliveryInfo.estimatedTime': { $exists: true }
    });

    const actuallyDelayed = delayedOrders.filter(order => order.isDelayed).length;
    if (actuallyDelayed > 0) {
      alerts.push({
        type: 'warning',
        message: `${actuallyDelayed} pedido(s) atrasado(s)`,
        count: actuallyDelayed
      });
    }

    // Produtos com estoque baixo
    const lowStockProducts = await Product.find({ 'availability.isActive': true });
    const lowStockCount = lowStockProducts.filter(p => p.isLowStock).length;
    
    if (lowStockCount > 0) {
      alerts.push({
        type: 'info',
        message: `${lowStockCount} produto(s) com estoque baixo`,
        count: lowStockCount
      });
    }

    res.json({
      success: true,
      data: {
        roomStats,
        reservationStats,
        orderStats,
        revenue: {
          monthly: totalRevenue,
          rooms: revenueData.roomRevenue,
          consumption: revenueData.consumptionRevenue,
          orders: orderRevenueData.total,
          reservationCount: revenueData.count,
          orderCount: orderRevenueData.count
        },
        alerts,
        lastUpdated: new Date()
      }
    });
  } catch (error) {
    console.error('Erro ao obter overview do dashboard:', error);
    res.status(500).json({
      success: false,
      message: 'Erro interno do servidor'
    });
  }
});

// @route   GET /api/dashboard/occupancy
// @desc    Obter dados de ocupação em tempo real
// @access  Private
router.get('/occupancy', authenticate, async (req, res) => {
  try {
    // Buscar todas as reservas ativas com detalhes
    const activeReservations = await Reservation.find({
      status: 'checked-in'
    })
    .populate('roomId', 'number type floor')
    .populate('customerId', 'name phone')
    .sort({ 'roomId.number': 1 });

    // Adicionar tempo restante para cada reserva
    const occupancyData = activeReservations.map(reservation => {
      const remainingTime = reservation.getRemainingTime();
      
      return {
        reservationId: reservation._id,
        reservationNumber: reservation.reservationNumber,
        room: {
          id: reservation.roomId._id,
          number: reservation.roomId.number,
          type: reservation.roomId.type,
          floor: reservation.roomId.floor
        },
        customer: {
          id: reservation.customerId._id,
          name: reservation.customerId.name,
          phone: reservation.customerId.phone
        },
        checkIn: reservation.actualCheckIn || reservation.checkIn,
        checkOut: reservation.checkOut,
        remainingTime,
        isOvertime: remainingTime?.expired || false,
        totalPrice: reservation.pricing.totalPrice,
        periodType: reservation.periodType
      };
    });

    // Estatísticas rápidas
    const stats = {
      totalOccupied: occupancyData.length,
      overtime: occupancyData.filter(r => r.isOvertime).length,
      checkingOutSoon: occupancyData.filter(r => 
        r.remainingTime && !r.remainingTime.expired && 
        r.remainingTime.hours === 0 && r.remainingTime.minutes <= 30
      ).length
    };

    res.json({
      success: true,
      data: {
        occupancy: occupancyData,
        stats
      }
    });
  } catch (error) {
    console.error('Erro ao obter dados de ocupação:', error);
    res.status(500).json({
      success: false,
      message: 'Erro interno do servidor'
    });
  }
});

// @route   GET /api/dashboard/revenue
// @desc    Obter dados de receita por período
// @access  Private
router.get('/revenue', authenticate, async (req, res) => {
  try {
    const { period = 'month', year, month } = req.query;
    
    let startDate, endDate, groupFormat;
    
    const currentDate = new Date();
    const currentYear = year ? parseInt(year) : currentDate.getFullYear();
    const currentMonth = month ? parseInt(month) - 1 : currentDate.getMonth();

    switch (period) {
      case 'week':
        startDate = new Date();
        startDate.setDate(startDate.getDate() - 7);
        endDate = new Date();
        groupFormat = "%Y-%m-%d";
        break;
      case 'month':
        startDate = new Date(currentYear, currentMonth, 1);
        endDate = new Date(currentYear, currentMonth + 1, 0, 23, 59, 59);
        groupFormat = "%Y-%m-%d";
        break;
      case 'year':
        startDate = new Date(currentYear, 0, 1);
        endDate = new Date(currentYear, 11, 31, 23, 59, 59);
        groupFormat = "%Y-%m";
        break;
      default:
        startDate = new Date(currentYear, currentMonth, 1);
        endDate = new Date(currentYear, currentMonth + 1, 0, 23, 59, 59);
        groupFormat = "%Y-%m-%d";
    }

    // Receita de quartos
    const roomRevenue = await Reservation.aggregate([
      {
        $match: {
          status: 'checked-out',
          checkOut: { $gte: startDate, $lte: endDate }
        }
      },
      {
        $group: {
          _id: { $dateToString: { format: groupFormat, date: "$checkOut" } },
          revenue: { $sum: "$pricing.totalPrice" },
          consumption: { $sum: "$consumptionTotal" },
          count: { $sum: 1 }
        }
      },
      { $sort: { _id: 1 } }
    ]);

    // Receita de pedidos
    const orderRevenue = await Order.aggregate([
      {
        $match: {
          status: 'delivered',
          'timeline.deliveredAt': { $gte: startDate, $lte: endDate }
        }
      },
      {
        $group: {
          _id: { $dateToString: { format: groupFormat, date: "$timeline.deliveredAt" } },
          revenue: { $sum: "$pricing.total" },
          count: { $sum: 1 }
        }
      },
      { $sort: { _id: 1 } }
    ]);

    // Combinar dados
    const revenueMap = new Map();
    
    roomRevenue.forEach(item => {
      revenueMap.set(item._id, {
        date: item._id,
        roomRevenue: item.revenue,
        consumption: item.consumption,
        orderRevenue: 0,
        reservationCount: item.count,
        orderCount: 0
      });
    });

    orderRevenue.forEach(item => {
      if (revenueMap.has(item._id)) {
        revenueMap.get(item._id).orderRevenue = item.revenue;
        revenueMap.get(item._id).orderCount = item.count;
      } else {
        revenueMap.set(item._id, {
          date: item._id,
          roomRevenue: 0,
          consumption: 0,
          orderRevenue: item.revenue,
          reservationCount: 0,
          orderCount: item.count
        });
      }
    });

    const revenueData = Array.from(revenueMap.values()).map(item => ({
      ...item,
      total: item.roomRevenue + item.consumption + item.orderRevenue
    }));

    // Totais do período
    const totals = revenueData.reduce((acc, item) => ({
      roomRevenue: acc.roomRevenue + item.roomRevenue,
      consumption: acc.consumption + item.consumption,
      orderRevenue: acc.orderRevenue + item.orderRevenue,
      total: acc.total + item.total,
      reservationCount: acc.reservationCount + item.reservationCount,
      orderCount: acc.orderCount + item.orderCount
    }), { roomRevenue: 0, consumption: 0, orderRevenue: 0, total: 0, reservationCount: 0, orderCount: 0 });

    res.json({
      success: true,
      data: {
        period,
        startDate,
        endDate,
        revenueData,
        totals
      }
    });
  } catch (error) {
    console.error('Erro ao obter dados de receita:', error);
    res.status(500).json({
      success: false,
      message: 'Erro interno do servidor'
    });
  }
});

// @route   GET /api/dashboard/performance
// @desc    Obter indicadores de performance
// @access  Private
router.get('/performance', authenticate, async (req, res) => {
  try {
    const { period = 'month' } = req.query;
    
    let startDate, previousStartDate;
    const endDate = new Date();
    
    switch (period) {
      case 'week':
        startDate = new Date();
        startDate.setDate(startDate.getDate() - 7);
        previousStartDate = new Date();
        previousStartDate.setDate(previousStartDate.getDate() - 14);
        break;
      case 'month':
        startDate = new Date();
        startDate.setMonth(startDate.getMonth() - 1);
        previousStartDate = new Date();
        previousStartDate.setMonth(previousStartDate.getMonth() - 2);
        break;
      case 'year':
        startDate = new Date();
        startDate.setFullYear(startDate.getFullYear() - 1);
        previousStartDate = new Date();
        previousStartDate.setFullYear(previousStartDate.getFullYear() - 2);
        break;
      default:
        startDate = new Date();
        startDate.setMonth(startDate.getMonth() - 1);
        previousStartDate = new Date();
        previousStartDate.setMonth(previousStartDate.getMonth() - 2);
    }

    // Função para calcular métricas de um período
    const calculateMetrics = async (start, end) => {
      const reservations = await Reservation.find({
        createdAt: { $gte: start, $lte: end }
      });

      const revenue = await Reservation.aggregate([
        {
          $match: {
            status: 'checked-out',
            checkOut: { $gte: start, $lte: end }
          }
        },
        {
          $group: {
            _id: null,
            total: { $sum: '$pricing.totalPrice' },
            consumption: { $sum: '$consumptionTotal' }
          }
        }
      ]);

      const customers = await Customer.countDocuments({
        createdAt: { $gte: start, $lte: end }
      });

      const orders = await Order.countDocuments({
        'timeline.orderedAt': { $gte: start, $lte: end }
      });

      // Taxa de ocupação média
      const totalRooms = await Room.countDocuments({ isActive: true });
      const occupiedDays = await Reservation.aggregate([
        {
          $match: {
            status: { $in: ['checked-in', 'checked-out'] },
            checkIn: { $gte: start, $lte: end }
          }
        },
        {
          $group: {
            _id: null,
            totalHours: { $sum: { $divide: [{ $subtract: ['$checkOut', '$checkIn'] }, 1000 * 60 * 60] } }
          }
        }
      ]);

      const periodHours = (end - start) / (1000 * 60 * 60);
      const occupancyRate = totalRooms > 0 && occupiedDays[0] ? 
        ((occupiedDays[0].totalHours / (totalRooms * periodHours)) * 100) : 0;

      return {
        reservations: reservations.length,
        revenue: revenue[0]?.total || 0,
        consumption: revenue[0]?.consumption || 0,
        newCustomers: customers,
        orders,
        occupancyRate: occupancyRate.toFixed(2)
      };
    };

    const currentMetrics = await calculateMetrics(startDate, endDate);
    const previousMetrics = await calculateMetrics(previousStartDate, startDate);

    // Calcular variações percentuais
    const calculateChange = (current, previous) => {
      if (previous === 0) return current > 0 ? 100 : 0;
      return ((current - previous) / previous * 100).toFixed(2);
    };

    const performance = {
      current: currentMetrics,
      previous: previousMetrics,
      changes: {
        reservations: calculateChange(currentMetrics.reservations, previousMetrics.reservations),
        revenue: calculateChange(currentMetrics.revenue, previousMetrics.revenue),
        consumption: calculateChange(currentMetrics.consumption, previousMetrics.consumption),
        newCustomers: calculateChange(currentMetrics.newCustomers, previousMetrics.newCustomers),
        orders: calculateChange(currentMetrics.orders, previousMetrics.orders),
        occupancyRate: calculateChange(
          parseFloat(currentMetrics.occupancyRate), 
          parseFloat(previousMetrics.occupancyRate)
        )
      }
    };

    // Top performers
    const topRooms = await Reservation.aggregate([
      {
        $match: {
          status: 'checked-out',
          checkOut: { $gte: startDate, $lte: endDate }
        }
      },
      {
        $lookup: {
          from: 'rooms',
          localField: 'roomId',
          foreignField: '_id',
          as: 'room'
        }
      },
      { $unwind: '$room' },
      {
        $group: {
          _id: '$room.number',
          revenue: { $sum: '$pricing.totalPrice' },
          reservations: { $sum: 1 },
          avgPrice: { $avg: '$pricing.totalPrice' }
        }
      },
      { $sort: { revenue: -1 } },
      { $limit: 5 }
    ]);

    const topCustomers = await Reservation.aggregate([
      {
        $match: {
          status: 'checked-out',
          checkOut: { $gte: startDate, $lte: endDate }
        }
      },
      {
        $lookup: {
          from: 'customers',
          localField: 'customerId',
          foreignField: '_id',
          as: 'customer'
        }
      },
      { $unwind: '$customer' },
      {
        $group: {
          _id: '$customer._id',
          name: { $first: '$customer.name' },
          totalSpent: { $sum: { $add: ['$pricing.totalPrice', '$consumptionTotal'] } },
          visits: { $sum: 1 }
        }
      },
      { $sort: { totalSpent: -1 } },
      { $limit: 5 }
    ]);

    res.json({
      success: true,
      data: {
        period,
        startDate,
        endDate,
        performance,
        topPerformers: {
          rooms: topRooms,
          customers: topCustomers
        }
      }
    });
  } catch (error) {
    console.error('Erro ao obter dados de performance:', error);
    res.status(500).json({
      success: false,
      message: 'Erro interno do servidor'
    });
  }
});

// @route   GET /api/dashboard/alerts
// @desc    Obter alertas e notificações importantes
// @access  Private
router.get('/alerts', authenticate, async (req, res) => {
  try {
    const alerts = [];
    const now = new Date();

    // 1. Reservas próximas do check-out (próximos 30 minutos)
    const soonCheckOuts = await Reservation.find({
      status: 'checked-in',
      checkOut: {
        $gte: now,
        $lte: new Date(now.getTime() + 30 * 60 * 1000)
      }
    }).populate('roomId', 'number').populate('customerId', 'name');

    soonCheckOuts.forEach(reservation => {
      alerts.push({
        type: 'info',
        priority: 'medium',
        title: 'Check-out em breve',
        message: `Quarto ${reservation.roomId.number} - ${reservation.customerId.name}`,
        time: reservation.checkOut,
        action: 'checkout',
        id: reservation._id
      });
    });

    // 2. Reservas em atraso (passaram do horário de check-out)
    const overdueReservations = await Reservation.find({
      status: 'checked-in',
      checkOut: { $lt: now }
    }).populate('roomId', 'number').populate('customerId', 'name');

    overdueReservations.forEach(reservation => {
      const hoursOverdue = Math.floor((now - reservation.checkOut) / (1000 * 60 * 60));
      alerts.push({
        type: 'warning',
        priority: 'high',
        title: 'Reserva em atraso',
        message: `Quarto ${reservation.roomId.number} - ${hoursOverdue}h de atraso`,
        time: reservation.checkOut,
        action: 'checkout',
        id: reservation._id
      });
    });

    // 3. Pedidos atrasados
    const delayedOrders = await Order.find({
      status: { $in: ['confirmed', 'preparing'] },
      'deliveryInfo.estimatedTime': { $exists: true }
    }).populate('customerId', 'name');

    delayedOrders.forEach(order => {
      if (order.isDelayed) {
        alerts.push({
          type: 'warning',
          priority: 'medium',
          title: 'Pedido atrasado',
          message: `${order.orderNumber} - Quarto ${order.roomNumber}`,
          time: new Date(order.timeline.orderedAt.getTime() + (order.deliveryInfo.estimatedTime * 60 * 1000)),
          action: 'order',
          id: order._id
        });
      }
    });

    // 4. Quartos que precisam de limpeza há mais de 1 hora
    const dirtyRooms = await Room.find({
      status: 'cleaning',
      lastCleaned: { $lt: new Date(now.getTime() - 60 * 60 * 1000) }
    });

    dirtyRooms.forEach(room => {
      alerts.push({
        type: 'info',
        priority: 'low',
        title: 'Limpeza pendente',
        message: `Quarto ${room.number} aguardando limpeza`,
        time: room.lastCleaned,
        action: 'cleaning',
        id: room._id
      });
    });

    // 5. Produtos com estoque crítico (zero ou abaixo do mínimo)
    const criticalStock = await Product.find({
      'availability.isActive': true,
      $or: [
        { 'inventory.currentStock': 0 },
        { $expr: { $lte: ['$inventory.currentStock', '$inventory.minStock'] } }
      ]
    });

    criticalStock.forEach(product => {
      const isOutOfStock = product.inventory.currentStock === 0;
      alerts.push({
        type: isOutOfStock ? 'error' : 'warning',
        priority: isOutOfStock ? 'high' : 'medium',
        title: isOutOfStock ? 'Produto em falta' : 'Estoque baixo',
        message: `${product.name} - Estoque: ${product.inventory.currentStock}`,
        time: product.updatedAt,
        action: 'stock',
        id: product._id
      });
    });

    // 6. Reservas pendentes de confirmação há mais de 30 minutos
    const pendingReservations = await Reservation.find({
      status: 'pending',
      createdAt: { $lt: new Date(now.getTime() - 30 * 60 * 1000) }
    }).populate('customerId', 'name').populate('roomId', 'number');

    pendingReservations.forEach(reservation => {
      alerts.push({
        type: 'info',
        priority: 'medium',
        title: 'Reserva pendente',
        message: `${reservation.customerId.name} - Quarto ${reservation.roomId.number}`,
        time: reservation.createdAt,
        action: 'reservation',
        id: reservation._id
      });
    });

    // Ordenar por prioridade e hora
    const priorityOrder = { high: 3, medium: 2, low: 1 };
    alerts.sort((a, b) => {
      if (priorityOrder[a.priority] !== priorityOrder[b.priority]) {
        return priorityOrder[b.priority] - priorityOrder[a.priority];
      }
      return new Date(b.time) - new Date(a.time);
    });

    // Estatísticas dos alertas
    const alertStats = {
      total: alerts.length,
      high: alerts.filter(a => a.priority === 'high').length,
      medium: alerts.filter(a => a.priority === 'medium').length,
      low: alerts.filter(a => a.priority === 'low').length
    };

    res.json({
      success: true,
      data: {
        alerts: alerts.slice(0, 50), // Limitar a 50 alertas mais recentes
        stats: alertStats,
        lastUpdated: now
      }
    });
  } catch (error) {
    console.error('Erro ao obter alertas:', error);
    res.status(500).json({
      success: false,
      message: 'Erro interno do servidor'
    });
  }
});

// @route   GET /api/dashboard/quick-stats
// @desc    Obter estatísticas rápidas para widgets
// @access  Private
router.get('/quick-stats', authenticate, async (req, res) => {
  try {
    const now = new Date();
    const startOfDay = new Date(now.setHours(0, 0, 0, 0));
    const endOfDay = new Date(now.setHours(23, 59, 59, 999));

    // Estatísticas rápidas em paralelo
    const [
      totalRooms,
      occupiedRooms,
      todayReservations,
      activeOrders,
      totalCustomers,
      lowStockCount
    ] = await Promise.all([
      Room.countDocuments({ isActive: true }),
      Room.countDocuments({ isActive: true, status: 'occupied' }),
      Reservation.countDocuments({
        createdAt: { $gte: startOfDay, $lte: endOfDay }
      }),
      Order.countDocuments({
        status: { $in: ['pending', 'confirmed', 'preparing', 'ready'] }
      }),
      Customer.countDocuments({ isActive: true }),
      Product.find({ 'availability.isActive': true }).then(products => 
        products.filter(p => p.isLowStock).length
      )
    ]);

    const occupancyRate = totalRooms > 0 ? 
      ((occupiedRooms / totalRooms) * 100).toFixed(1) : 0;

    res.json({
      success: true,
      data: {
        rooms: {
          total: totalRooms,
          occupied: occupiedRooms,
          available: totalRooms - occupiedRooms,
          occupancyRate: parseFloat(occupancyRate)
        },
        reservations: {
          today: todayReservations,
          active: await Reservation.countDocuments({ status: 'checked-in' })
        },
        orders: {
          active: activeOrders,
          pending: await Order.countDocuments({ status: 'pending' })
        },
        customers: {
          total: totalCustomers,
          vip: await Customer.countDocuments({ isActive: true, isVip: true })
        },
        alerts: {
          lowStock: lowStockCount,
          total: lowStockCount + (await Order.find({
            status: { $in: ['confirmed', 'preparing'] },
            'deliveryInfo.estimatedTime': { $exists: true }
          }).then(orders => orders.filter(o => o.isDelayed).length))
        },
        lastUpdated: new Date()
      }
    });
  } catch (error) {
    console.error('Erro ao obter estatísticas rápidas:', error);
    res.status(500).json({
      success: false,
      message: 'Erro interno do servidor'
    });
  }
});

module.exports = router;