import { fireEvent, render, screen, waitFor } from '@testing-library/react';

import AdminPanel from './AdminPanel';
import {
  deleteAdminUser,
  getAdminUsers,
  resetAdminUserPassword,
  updateAdminUserStatus,
} from '../../utilities/api';


jest.mock('../../utilities/api', () => ({
  deleteAdminUser: jest.fn(),
  getAdminUsers: jest.fn(),
  resetAdminUserPassword: jest.fn(),
  updateAdminUserStatus: jest.fn(),
}));


describe('AdminPanel', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    updateAdminUserStatus.mockResolvedValue({});
    window.confirm = jest.fn(() => true);
  });

  test('lets an admin open the reset dialog and submit a new password', async () => {
    getAdminUsers.mockResolvedValue({
      users: [
        {
          id: 2,
          email: 'operator@example.com',
          displayName: 'Operator User',
          role: 'operator',
          status: 'approved',
          approvedByEmail: 'admin@example.com',
          lastLoginAt: null,
        },
      ],
    });
    resetAdminUserPassword.mockResolvedValue({
      message: 'Password reset successfully. Existing sessions were signed out.',
      user: {
        id: 2,
        email: 'operator@example.com',
        displayName: 'Operator User',
        role: 'operator',
        status: 'approved',
        approvedByEmail: 'admin@example.com',
        lastLoginAt: null,
      },
    });

    render(<AdminPanel />);

    expect(await screen.findByText('Operator User')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /reset password/i }));

    expect(await screen.findByRole('heading', { name: /reset user password/i })).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText(/new password/i), {
      target: { value: 'OperatorPass456' },
    });
    fireEvent.click(screen.getByRole('button', { name: /^reset password$/i }));

    await waitFor(() => {
      expect(resetAdminUserPassword).toHaveBeenCalledWith(2, 'OperatorPass456');
    });
    expect(
      await screen.findByText(/existing sessions were signed out/i)
    ).toBeInTheDocument();
  });

  test('lets an admin permanently delete a non-admin user account', async () => {
    getAdminUsers.mockResolvedValue({
      users: [
        {
          id: 2,
          email: 'operator@example.com',
          displayName: 'Operator User',
          role: 'operator',
          status: 'approved',
          approvedByEmail: 'admin@example.com',
          lastLoginAt: null,
        },
      ],
    });
    deleteAdminUser.mockResolvedValue({
      message: 'User account deleted successfully.',
      user: {
        id: 2,
        email: 'operator@example.com',
        displayName: 'Operator User',
      },
    });

    render(<AdminPanel />);

    expect(await screen.findByText('Operator User')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /delete user/i }));

    await waitFor(() => {
      expect(deleteAdminUser).toHaveBeenCalledWith(2);
    });

    expect(await screen.findByText(/user account deleted successfully/i)).toBeInTheDocument();
    expect(screen.queryByText('Operator User')).not.toBeInTheDocument();
  });
});
