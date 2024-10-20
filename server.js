require('dotenv').config();
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const mongoose = require('mongoose');
const Message = require('./models/messages.js');  
const User = require('./models/user.js');
const bcrypt = require('bcrypt');
const app = express();
const server = http.createServer(app);
const io = new Server(server);
const { generateUniqueId } = require('./models/utils/messageUtils.js');  

const createRoomId = (userId1, userId2) => {
  return [userId1, userId2].sort().join('-');
};


// Connect to MongoDB
mongoose.connect(process.env.MONGO_URI, {
  tls: true,
  tlsAllowInvalidCertificates: true,  // if you're facing certificate validation issues
})
  .then(() => console.log('MongoDB connected'))
  .catch((err) => console.error('MongoDB connection error:', err));


// Middleware to parse JSON
app.use(express.json());

// Define a basic route to test the server
app.get('/', (req, res) => {
  res.send('Server is running');
});

// register validate
app.post('/register', async (req, res) => {
  const { name, email, password } = req.body;
  const userId = new mongoose.Types.ObjectId().toString();
  console.log('Generated userId:', userId);
  const hashedPassword = await bcrypt.hash(password, 10);

  try {
    const newUser = new User({ userId, name, email, password });
    await newUser.save();
    res.status(201).json({ message: 'User registered successfully' });
  } catch (error) {
    console.error('Error registering user:', error.message);
    if (error.code === 11000) {
      return res.status(409).json({ message: 'Email already exists.', error: error.message, password: hashedPassword });
    }
    res.status(500).send('Error registering user');
  }
});
// login validate
app.post('/login', async (req, res) => {
    const { email, password } = req.body;
  
    try {
      const user = await User.findOne({ email, password });
      if (user) {
        res.json({ userId: user.userId, message: 'Login successful' });
      } else {
        res.status(401).send('Invalid email or password');
      }
    } catch (error) {
      console.error('Error logging in:', error);
      res.status(500).send('Error logging in');
    }
  });
// messages
app.post('/messages', async (req, res) => {
    const { senderId, receiverId, message } = req.body;
  
    try {
      const newMessage = new Message({ senderId, receiverId, message });
      await newMessage.save();
  
      res.status(201).json({ message: 'Message sent successfully', newMessage });
    } catch (error) {
      console.error('Error sending message:', error);
      res.status(500).send('Error sending message');
    }
  });
  
  

io.on('connection', (socket) => {
  console.log('A user connected:', socket.id);
  
// Handle joining a room for private messaging
socket.on('join room', ({ userId, receiverId }) => {
    const roomId = createRoomId(userId, receiverId);
    socket.join(roomId);
    console.log(`User ${userId} joined room ${roomId}`);
  });
  
// Handle private messages
socket.on('private message', async ({ senderId, receiverId, message }) => {
    const roomId = createRoomId(senderId, receiverId);
    const timestamp = new Date().toISOString();
    const uniqueId = generateUniqueId(senderId, receiverId, message, timestamp);
  
    const newMessage = new Message({
        id: uniqueId, // Assuming your Message model has an `id` field
        senderId,
        receiverId,
        message,
        timestamp,
      });
  
      await newMessage.save();
  
      // Emit the message to the room (only to users in that room)
      io.to(roomId).emit('private message', {
        id: uniqueId, // Include the unique ID in the emitted message
        senderId,
        message,
        timestamp,
      });
  
      console.log(`Message from ${senderId} to ${receiverId} in room ${roomId}: ${message}`);
    });
  
    // Handle user disconnection
    socket.on('disconnect', () => {
      console.log('User disconnected:', socket.id);
    });
  });
  

// Fetch messages between two users
app.get('/messages/:userId/:receiverId', async (req, res) => {
  const { userId, receiverId } = req.params;
  const roomId = createRoomId(userId, receiverId);

  try {
    const messages = await Message.find({
      $or: [
        { senderId: userId, receiverId },
        { senderId: receiverId, receiverId: userId },
      ],
    }).sort({ timestamp: 1 });

    res.json({ roomId, messages });
  } catch (error) {
    console.error('Error fetching messages:', error);
    res.status(500).send('Error fetching messages');
  }
});

// Start the server
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
