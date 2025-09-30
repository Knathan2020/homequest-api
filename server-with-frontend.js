// Combined server - serves both API and frontend
const express = require('express');
const path = require('path');
const cors = require('cors');

// Copy your existing server.ts content here but add:
const app = express();

// Your existing middleware
app.use(cors());
app.use(express.json());

// Import ALL routes (fixing the current issue)
const builderPhonesRoutes = require('./routes/builder-phones.routes').default;
const vendorBiddingRoutes = require('./routes/vendor-bidding.routes').default;
const appointmentsRoutes = require('./routes/appointments.routes').default;

app.use('/api/builder-phones', builderPhonesRoutes);
app.use('/api/vendor-bidding', vendorBiddingRoutes);
app.use('/api/appointments', appointmentsRoutes);

// ... rest of your API routes ...

// SERVE THE FRONTEND BUILD
app.use(express.static(path.join(__dirname, '../frontend-build')));

// Catch all - send React app for any route not handled by API
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '../frontend-build', 'index.html'));
});

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`Frontend: http://localhost:${PORT}`);
  console.log(`API: http://localhost:${PORT}/api`);
});