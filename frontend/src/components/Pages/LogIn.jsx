import React, { useState } from 'react';
import axios from 'axios';
import { useNavigate } from 'react-router-dom'; // Import useNavigate

import './Pages.css'; // Import custom CSS for styling the NavBar component
import VuLogo from './RGB_Vertical_Viterbo_Logo.png';

const Login = () => {
  const [password, setPassword] = useState('');
  const [email, setEmail] = useState('');
  const [isRegister, setIsRegister] = useState(false); // Toggle between login and register
  const [error, setError] = useState(''); 
  const navigate = useNavigate(); // Get navigate function

  const handleSubmit = async (e) => {
    e.preventDefault();
    const endpoint = isRegister ? '/register' : '/login';
    const url = `http://localhost:5001${endpoint}`; // Adjust to backend URL if different

    try {
      const response = await axios.post(url, { email, password }, { withCredentials: true });

      if (response.data.message) {
        alert(response.data.message); // Show success message
        if (!isRegister) {
          navigate('/Home'); // Navigate to Home page after login
        } else {
          setIsRegister(false); // Switch to login mode after registration
        }
      }
    } catch (error) {
      setError(error.response?.data?.error || 'Something went wrong');
    }
  };

  return (
    <div className="container text-center" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
      <div className="center">

        <img className='VuLogo' src={VuLogo} alt='VuLogo'/>
        <br></br>
        <br></br>

        <form onSubmit={handleSubmit}>
          <h2>{isRegister ? 'Register' : 'Login'}</h2>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="Email"
            required
          />
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Password"
            required
          />
          <button type="submit">{isRegister ? 'Register' : 'Login'}</button>
          {error && <p style={{ color: 'red' }}>{error}</p>}
          <p onClick={() => setIsRegister(!isRegister)} style={{ cursor: 'pointer' }}>
            {isRegister ? 'Already have an account? Log in' : 'No account? Register'}
          </p>
        </form>
      </div>
    </div>
  );
};

export default Login;
