import { Request, Response } from 'express';
import { clientService } from '../services/client.service';

export const getClients = async (req: Request, res: Response) => {
  try {
    const query = req.query.query as string;
    const clients = await clientService.getClients(query);
    res.json({ clients });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
};

export const getClientTenant = async (req: Request, res: Response) => {
  try {
    const domain = req.query.domain as string;
    const tenantId = req.query.tenantId as string;
    const client = await clientService.getClientTenant(domain, tenantId);
    if (!client) {
      return res.status(404).json({ error: 'Tenant not found' });
    }
    res.json(client);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
};

export const getClientById = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const client = await clientService.getClientById(id);
    res.json(client);
  } catch (e: any) {
    res.status(404).json({ error: e.message });
  }
};

export const createClient = async (req: Request, res: Response) => {
  try {
    const result = await clientService.createClient(req.body, req);
    res.json(result);
  } catch (e: any) {
    res.status(400).json({ error: e.message });
  }
};

export const updateClient = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const result = await clientService.updateClient(id, req.body, req);
    res.json(result);
  } catch (e: any) {
    res.status(400).json({ error: e.message });
  }
};

export const resetClientPassword = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const result = await clientService.resetClientPassword(id, req.body, req);
    res.json(result);
  } catch (e: any) {
    res.status(400).json({ error: e.message });
  }
};

export const deleteClient = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const result = await clientService.deleteClient(id, req);
    res.json(result);
  } catch (e: any) {
    res.status(400).json({ error: e.message });
  }
};
