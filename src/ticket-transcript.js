function ticketTranscriptText(messages) {
  return messages.map((message) => {
    const timestamp = new Date(message.createdTimestamp).toISOString();
    const author = message.author.tag ?? message.author.username;
    const lines = [`[${timestamp}] ${author}:`, message.content || '[No text content]'];
    for (const attachment of message.attachments.values()) {
      lines.push(`Attachment: ${attachment.name ?? 'file'} (${attachment.url})`);
    }
    return lines.join('\n');
  }).join('\n\n');
}

module.exports = { ticketTranscriptText };
