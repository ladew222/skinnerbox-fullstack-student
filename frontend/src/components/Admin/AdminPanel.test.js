import { fireEvent, render, screen, waitFor } from '@testing-library/react';

import AdminPanel from './AdminPanel';
import { getAdminUsers, resetAdminUserPassword, updateAdminUserStatus } from '../../utilities/api';


jest.mock('../../utilities/api', () => ({
  getAdminUsers: jest.fn(),
  resetAdminUserPassword: jest.fn(),
  updateAdminUserStatus: jest.fn(),
}));


describe('AdminPanel', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    updateAdminUserStatus.mockResolvedValue({});
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
});
