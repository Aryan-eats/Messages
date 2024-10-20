const crypto = require('crypto');

function generateUniqueId(senderId, receiverId, message, timestamp) {
    const data = `${senderId}-${receiverId}-${message}-${timestamp}`;
    return crypto.createHash('sha256').update(data).digest('hex');
}

module.exports = { generateUniqueId };
