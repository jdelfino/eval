/**
 * In-memory user repository implementation.
 * Stores users in memory for simple local authentication.
 * Can be replaced with database-backed implementation later.
 */

import { User, UserRole, AuthenticationError } from '../types';
import { IUserRepository } from '../interfaces';

/**
 * Simple in-memory user repository.
 * Users are stored in a Map for fast lookups.
 */
export class InMemoryUserRepository implements IUserRepository {
  private users: Map<string, User> = new Map();
  private emailIndex: Map<string, string> = new Map(); // email -> userId

  /**
   * Save a user to storage.
   * Creates new user if not exists, updates if exists.
   */
  async saveUser(user: User): Promise<void> {
    this.users.set(user.id, user);
    this.emailIndex.set(user.email.toLowerCase(), user.id);
  }

  /**
   * Get a user by their ID.
   */
  async getUser(userId: string): Promise<User | null> {
    return this.users.get(userId) || null;
  }

  /**
   * List all users, optionally filtered by role and/or namespace.
   */
  async listUsers(role?: UserRole, namespaceId?: string): Promise<User[]> {
    let users = Array.from(this.users.values());

    if (namespaceId !== undefined) {
      users = users.filter(user => user.namespaceId === namespaceId);
    }

    if (role) {
      users = users.filter(user => user.role === role);
    }

    return users;
  }

  /**
   * Get all users in a specific namespace.
   */
  async getUsersByNamespace(namespaceId: string): Promise<User[]> {
    return Array.from(this.users.values()).filter(
      user => user.namespaceId === namespaceId
    );
  }

  /**
   * Get a user by their email (case-insensitive).
   */
  async getUserByEmail(email: string): Promise<User | null> {
    const userId = this.emailIndex.get(email.toLowerCase());
    if (!userId) {
      return null;
    }
    return this.users.get(userId) || null;
  }

  /**
   * Update user information.
   */
  async updateUser(userId: string, updates: Partial<User>): Promise<void> {
    const user = this.users.get(userId);
    if (!user) {
      throw new AuthenticationError(`User not found: ${userId}`);
    }

    // If email is being changed, update the index
    if (updates.email && updates.email !== user.email) {
      this.emailIndex.delete(user.email.toLowerCase());
      this.emailIndex.set(updates.email.toLowerCase(), userId);
    }

    // Merge updates into existing user
    const updatedUser = { ...user, ...updates };
    this.users.set(userId, updatedUser);
  }

  /**
   * Delete a user from storage.
   */
  async deleteUser(userId: string): Promise<void> {
    const user = this.users.get(userId);
    if (!user) {
      throw new AuthenticationError(`User not found: ${userId}`);
    }

    this.emailIndex.delete(user.email.toLowerCase());
    this.users.delete(userId);
  }

  /**
   * Get total user count (useful for bootstrapping first instructor).
   */
  async getUserCount(): Promise<number> {
    return this.users.size;
  }

  /**
   * Clear all users (useful for testing).
   */
  async clear(): Promise<void> {
    this.users.clear();
    this.emailIndex.clear();
  }
}
