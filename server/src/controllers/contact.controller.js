import asyncHandler from '../utils/asyncHandler.js';
import { contactService } from '../services/contact.service.js';
import { settingsService } from '../services/index.js';

export const submitMessage = asyncHandler(async (req, res) => {
  const data = await contactService.submit(req.body, { ip: req.ip });
  const { contact } = await settingsService.get();
  res.status(201).json({ success: true, message: contact.successMessage, data });
});

export const listMessages = asyncHandler(async (_req, res) => {
  const data = await contactService.list();
  res.json({ success: true, count: data.length, unread: data.filter((m) => !m.read).length, data });
});

export const markMessageRead = asyncHandler(async (req, res) => {
  const read = req.body?.read !== false;
  res.json({ success: true, data: await contactService.markRead(req.params.id, read) });
});

export const deleteMessage = asyncHandler(async (req, res) => {
  await contactService.remove(req.params.id);
  res.status(204).end();
});
