# Warehouse Management System with Authentication

A comprehensive warehouse management system built with Express.js, SQLite, and vanilla JavaScript. Features user authentication, inventory management, order processing, and real-time alerts for product expiry management.

## Features

### 🔐 Authentication & Security
- User registration and login with email
- JWT-based authentication
- Password hashing with bcrypt
- Session management
- Protected routes

### 📦 Inventory Management
- Add, edit, and delete products
- Category-based organization
- Stock level tracking
- Price management
- Expiry date monitoring

### ⚠️ Smart Alerts
- Automatic expiry warnings (30-day threshold)
- Low stock notifications
- Real-time dashboard notifications
- Recommended dispatch dates

### 🧾 Order Processing
- Create orders with multiple items
- Automatic stock validation
- Order status tracking
- Customer management

### 🚚 Dispatch Management
- Automatic dispatch creation for ready orders
- Transport assignment
- Status tracking
- Integration with order system

### 📊 Analytics & Reports
- Real-time dashboard metrics
- Visual charts and graphs
- Inventory value calculations
- Monthly summaries

## Technology Stack

- **Backend**: Node.js, Express.js
- **Database**: SQLite with sqlite3
- **Authentication**: JWT, bcrypt
- **Frontend**: Vanilla JavaScript, HTML5, CSS3
- **Charts**: Chart.js
- **Icons**: Unicode emojis

## Quick Start

### Prerequisites
- Node.js (version 14 or higher)
- npm or yarn

### Installation

1. **Clone or download the project files**
   ```bash
   # If cloning from a repository
   git clone <repository-url>
   cd warehouse-management
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Initialize the database**
   ```bash
   npm run seed
   ```

4. **Start the development server**
   ```bash
   npm start
   ```

5. **Open your browser**
   Navigate to `http://localhost:3000`

## File Structure

```
warehouse-management/
├── public/
│   ├── index.html          # Onboarding/landing page
│   ├── dashboard.html      # Main dashboard
│   ├── inventory.html      # Product management
│   ├── orders.html         # Order management
│   ├── dispatch.html       # Dispatch tracking
│   ├── reports.html        # Reports and analytics
│   ├── script.js           # Frontend JavaScript
│   └── style.css           # Styles
├── db.js                   # Database setup and schema
├── server.js               # Express server with auth
├── seed.js                 # Database initialization
├── package.json            # Dependencies and scripts
└── README.md              # This file
```

## Database Schema

### Users Table
- `id` (TEXT): Unique user identifier
- `name` (TEXT): User's full name
- `email` (TEXT): Email address (unique)
- `company` (TEXT): Company name
- `password` (TEXT): Hashed password
- `createdAt` (INTEGER): Registration timestamp
- `lastLogin` (INTEGER): Last login timestamp

### Products Table
- `id` (TEXT): Product identifier (per user)
- `name` (TEXT): Product name
- `category` (TEXT): Product category
- `qty` (INTEGER): Stock quantity
- `price` (REAL): Unit price
- `expiry` (TEXT): Expiry date (YYYY-MM-DD)
- `low` (INTEGER): Low stock threshold
- `userId` (TEXT): Owner user ID

### Orders Table
- `id` (TEXT): Order identifier
- `customer` (TEXT): Customer name
- `date` (TEXT): Order date
- `status` (TEXT): Order status
- `userId` (TEXT): Owner user ID

### Order Items Table
- `id` (INTEGER): Auto-increment ID
- `order_id` (TEXT): Related order ID
- `product_id` (TEXT): Product ID
- `qty` (INTEGER): Ordered quantity

### Dispatches Table
- `id` (TEXT): Dispatch identifier
- `order_id` (TEXT): Related order ID
- `transport` (TEXT): Transport method
- `status` (TEXT): Dispatch status
- `userId` (TEXT): Owner user ID

## API Endpoints

### Authentication
- `POST /api/auth/register` - User registration
- `POST /api/auth/login` - User login
- `GET /api/auth/verify` - Token verification
- `POST /api/auth/logout` - User logout

### Products (Protected)
- `GET /api/products` - Get user's products
- `POST /api/products` - Create product
- `PUT /api/products/:id` - Update product
- `DELETE /api/products/:id` - Delete product

### Orders (Protected)
- `GET /api/orders` - Get user's orders
- `POST /api/orders` - Create order

### Dispatches (Protected)
- `GET /api/dispatches` - Get user's dispatches

### Analytics (Protected)
- `GET /api/metrics` - Dashboard metrics
- `GET /api/alerts` - Expiry alerts

## Security Features

### Password Security
- Passwords are hashed using bcrypt with salt rounds
- Minimum password length of 6 characters
- No plain text password storage

### JWT Authentication
- Tokens expire after 7 days
- Secure token verification on all protected routes
- Automatic token cleanup

### Data Isolation
- Each user can only access their own data
- Foreign key constraints ensure data integrity
- SQL injection prevention through prepared statements

## Environment Configuration

### Environment Variables
Create a `.env` file for production:

```env
NODE_ENV=production
PORT=3000
JWT_SECRET=your-super-secret-key-here-change-this-in-production
```

### Production Deployment
1. Set environment variables
2. Use a process manager like PM2
3. Set up reverse proxy (nginx)
4. Enable HTTPS
5. Regular database backups

## Development

### Available Scripts
- `npm start` - Start production server
- `npm run seed` - Initialize/reset database
- `npm run dev` - Start with auto-reload (if nodemon installed)

### Development Tips
1. The database file `warehouse.db` is created automatically
2. All user data is isolated - no shared data between users
3. The system automatically handles stock deduction on order creation
4. Dispatches are created automatically when orders are ready
5. Expiry alerts are calculated in real-time

## Troubleshooting

### Common Issues

**Database locked error**
```bash
# Stop the server and restart
npm start
```

**Missing dependencies**
```bash
# Reinstall dependencies
rm -rf node_modules package-lock.json
npm install
```

**Port already in use**
```bash
# Change port in server.js or kill process
lsof -ti:3000 | xargs kill
```

### Browser Compatibility
- Modern browsers with ES6+ support
- Chrome 60+, Firefox 55+, Safari 12+, Edge 79+

## Contributing

1. Follow the existing code style
2. Add proper error handling
3. Update documentation for new features
4. Test authentication flows thoroughly
5. Ensure data isolation between users

## License

This project is provided as-is for educational and development purposes.

## Support

For issues and questions:
1. Check the troubleshooting section
2. Review the browser console for errors
3. Check server logs for backend issues
4. Ensure all dependencies are installed correctly

---

**Security Note**: This is a development-ready system. For production use, implement additional security measures such as rate limiting, input validation, CSRF protection, and regular security audits.