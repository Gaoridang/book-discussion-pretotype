const express = require('express');
const http = require('http');
const socketIo = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = socketIo(server, { cors: { origin: '*' } });

const PORT = process.env.PORT || 3000;

const bookKnowledge = {
  '1984': {
    summary: "In George Orwell's 1984, Winston Smith lives in a dystopian society under the totalitarian rule of the Party and Big Brother. The world is divided into superstates in perpetual war, with surveillance, propaganda, and thought control suppressing individuality. Winston rebels by keeping a diary and pursuing a forbidden relationship, but is ultimately broken by the regime.",
    keyPoints: [
      "Themes: Totalitarianism, surveillance, truth manipulation.",
      "Real-life application: Reflect on modern privacy erosion and fake news."
    ]
  },
  'to-kill-a-mockingbird': {
    summary: "Harper Lee's To Kill a Mockingbird follows Scout Finch in 1930s Alabama, exploring racism and morality through her father Atticus's defense of a wrongly accused Black man. Scout, her brother Jem, and friend Dill learn about empathy, prejudice, and justice amid small-town secrets involving the reclusive Boo Radley.",
    keyPoints: [
      "Themes: Racial injustice, moral growth, empathy.",
      "Real-life application: Consider how prejudice affects society today."
    ]
  },
  'the-great-gatsby': {
    summary: "F. Scott Fitzgerald's The Great Gatsby is narrated by Nick Carraway, who moves to New York and befriends the mysterious millionaire Jay Gatsby. Gatsby pursues his lost love Daisy Buchanan, exposing the corruption and emptiness of the American Dream in the Jazz Age, culminating in tragedy.",
    keyPoints: [
      "Themes: Wealth inequality, illusion vs. reality, the American Dream.",
      "Real-life application: Examine materialism and social mobility in contemporary life."
    ]
  }
};

const bookMap = {
  '1984': '1984',
  'To Kill a Mockingbird': 'to-kill-a-mockingbird',
  'The Great Gatsby': 'the-great-gatsby'
};

const rooms = {};

function logEvent(eventType, data) {
  console.log({ timestamp: new Date().toISOString(), type: eventType, ...data });
}

function sendBotResponse(room, userMessage) {
  const knowledge = bookKnowledge[room];
  if (!knowledge) return;

  let botMessage = '';
  const lowerMsg = userMessage.toLowerCase();

  if (lowerMsg.includes('summary') || lowerMsg.includes('plot')) {
    botMessage = knowledge.summary;
  } else if (lowerMsg.includes('theme') || lowerMsg.includes('apply') || lowerMsg.includes('real life')) {
    botMessage = knowledge.keyPoints.join(' ');
  } else if (userMessage.endsWith('?')) {
    botMessage = `Interesting question. From the book: ${knowledge.keyPoints[Math.floor(Math.random() * knowledge.keyPoints.length)]}`;
  } else {
    botMessage = 'How does this relate to the themes in the book? Share your thoughts on real-life applications.';
  }

  if (botMessage) {
    const entry = { userId: 'AI', alias: 'AI Reader', message: botMessage, timestamp: new Date().toISOString() };
    rooms[room].push(entry);
    io.to(room).emit('message', entry);
    logEvent('bot_response', { room, trigger: userMessage });
  }
}

io.on('connection', (socket) => {
  const userIp = socket.handshake.address;
  const userId = require('crypto').createHash('sha256').update(userIp + Date.now()).digest('hex').slice(0, 8);

  let currentRoom = null;
  let joinTime = null;
  let userAlias = null;

  socket.on('join', ({ bookTitle, alias }) => {
    const room = bookMap[bookTitle];
    if (!room || !alias) return;

    if (currentRoom) socket.leave(currentRoom);
    currentRoom = room;
    userAlias = alias.trim().substring(0, 20);
    socket.join(currentRoom);
    joinTime = Date.now();

    socket.emit('history', rooms[currentRoom] || []);
    logEvent('join', { userId, alias: userAlias, room: currentRoom });

    const knowledge = bookKnowledge[currentRoom];
    if (knowledge) {
      const welcome = `Welcome, ${userAlias}! I'm the AI reader for this book. Here's a quick overview: ${knowledge.summary.substring(0, 200)}... Ask me about themes or applications!`;
      const entry = { userId: 'AI', alias: 'AI Reader', message: welcome, timestamp: new Date().toISOString() };
      rooms[currentRoom] = rooms[currentRoom] || [];
      rooms[currentRoom].push(entry);
      io.to(currentRoom).emit('message', entry);
      logEvent('bot_welcome', { room: currentRoom });
    }
  });

  socket.on('message', (msg) => {
    if (!currentRoom || !userAlias) return;
    const entry = { userId, alias: userAlias, message: msg, timestamp: new Date().toISOString() };
    if (!rooms[currentRoom]) rooms[currentRoom] = [];
    rooms[currentRoom].push(entry);
    io.to(currentRoom).emit('message', entry);
    logEvent('message', { userId, alias: userAlias, room: currentRoom, messageLength: msg.length });

    sendBotResponse(currentRoom, msg);

    if (rooms[currentRoom].length > 1 && rooms[currentRoom][rooms[currentRoom].length - 2].userId === 'AI') {
      logEvent('user_reply_to_bot', { userId, alias: userAlias, room: currentRoom });
    }
  });

  socket.on('disconnect', () => {
    if (currentRoom && joinTime) {
      const duration = (Date.now() - joinTime) / 1000;
      logEvent('session_end', { userId, alias: userAlias, room: currentRoom, duration });
    }
  });
});

app.get('/', (req, res) => {
  res.sendFile(__dirname + '/index.html');
});

server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});