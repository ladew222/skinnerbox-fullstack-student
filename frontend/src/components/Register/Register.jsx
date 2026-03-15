import React, { useState } from 'react';
import { Alert, Button, FormControl, Input, InputLabel, Stack, Typography } from '@mui/material';
import { Link, Navigate, useNavigate } from 'react-router-dom';

import { useAuth } from '../../context/AuthContext';
import '../Login/Login.css';


const Register = () => {
  // Form state used to request a new account that an admin can later approve.
  const [displayName, setDisplayName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  // Feedback shown after the backend accepts or rejects the registration request.
  const [errorMessage, setErrorMessage] = useState('');
  const [successMessage, setSuccessMessage] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const { isAuthenticated, register } = useAuth();
  const navigate = useNavigate();

  if (isAuthenticated) {
    return <Navigate replace to="/Trial" />;
  }

  const handleSubmit = async (event) => {
    event.preventDefault();
    setErrorMessage('');
    setSuccessMessage('');

    if (password !== confirmPassword) {
      setErrorMessage('Passwords must match before submitting the registration request.');
      return;
    }

    setIsSubmitting(true);
    try {
      const response = await register({
        email,
        password,
        displayName,
      });
      setSuccessMessage(response.message);
      navigate('/LogIn', {
        replace: true,
        state: { registrationSubmitted: true },
      });
    } catch (error) {
      setErrorMessage(error.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="trial-settings">
      <form onSubmit={handleSubmit}>
        <Stack spacing={3}>
          <div>
            <Typography variant="h4" component="h1" gutterBottom>
              Request Access
            </Typography>
            <Typography variant="body1" color="text.secondary">
              Create an account request. A local admin must approve it before you can access tests or results.
            </Typography>
          </div>

          {errorMessage && <Alert severity="error">{errorMessage}</Alert>}
          {successMessage && <Alert severity="success">{successMessage}</Alert>}

          <FormControl fullWidth>
            <InputLabel htmlFor="registerDisplayName">Display Name</InputLabel>
            <Input
              id="registerDisplayName"
              placeholder="Enter Name"
              value={displayName}
              onChange={(event) => setDisplayName(event.target.value)}
            />
          </FormControl>

          <FormControl fullWidth>
            <InputLabel htmlFor="registerEmail">Email</InputLabel>
            <Input
              id="registerEmail"
              placeholder="Enter Email"
              required
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
            />
          </FormControl>

          <FormControl fullWidth>
            <InputLabel htmlFor="registerPassword">Password</InputLabel>
            <Input
              id="registerPassword"
              placeholder="Enter Password"
              required
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
            />
          </FormControl>

          <FormControl fullWidth>
            <InputLabel htmlFor="registerConfirmPassword">Confirm Password</InputLabel>
            <Input
              id="registerConfirmPassword"
              placeholder="Confirm Password"
              required
              type="password"
              value={confirmPassword}
              onChange={(event) => setConfirmPassword(event.target.value)}
            />
          </FormControl>

          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
            <Button type="submit" variant="contained" size="large" disabled={isSubmitting}>
              {isSubmitting ? 'Submitting...' : 'Submit Request'}
            </Button>
            <Button component={Link} to="/LogIn" variant="outlined" size="large">
              Back to Sign In
            </Button>
          </Stack>
        </Stack>
      </form>
    </div>
  );
};


export default Register;
