import { messageRepository } from '../repositories/index.js';
import AppError from '../utils/AppError.js';

export const contactService = {
  /**
   * Stores a contact message. This is the hook point for sending an email
   * notification (e.g. via nodemailer or a transactional email API).
   */
  async submit({ name, email, subject, message }, meta = {}) {
    const record = await messageRepository.create({
      name,
      email,
      subject: subject ?? '',
      message,
      read: false,
      ip: meta.ip,
    });
    return { id: record.id, createdAt: record.createdAt };
  },

  async list() {
    const messages = await messageRepository.findAll();
    return messages.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  },

  async markRead(id, read = true) {
    const msg = await messageRepository.update(id, { read });
    if (!msg) throw AppError.notFound('Message not found');
    return msg;
  },

  async remove(id) {
    if (!(await messageRepository.remove(id))) throw AppError.notFound('Message not found');
  },
};
