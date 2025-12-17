import React from "react";
import "./ResultsList.css";

// Card component
const Card = ({ children, onClick, className }) => (
  <div
    className={`border rounded-lg p-4 shadow-md bg-white ${className}`}
    onClick={onClick}
    style={{ cursor: "pointer" }}
  >
    {children}
  </div>
);

// Card content component
const CardContent = ({ children }) => <div>{children}</div>;

// Button component
const Button = ({ children, className, onClick }) => (
  <button
    className={`py-2 px-4 bg-blue-500 text-white rounded hover:bg-blue-600 ${className}`}
    onClick={onClick}
  >
    {children}
  </button>
);

// Drawer component for displaying detailed information
const Drawer = ({ isOpen, onClose, children }) => {
  if (!isOpen) return null;
  return (
    <div
      className="fixed inset-0 bg-gray-800 bg-opacity-50 flex justify-end"
      onClick={onClose}
    >
      <div
        className="bg-white w-80 h-full p-4 overflow-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {children}
      </div>
    </div>
  );
};

// Test data for demonstration purposes
export const testData = [
  {
    id: 1,
    complete: true,
    pressesNeeded: 50,
    totalPresses: 120,
    duration: "30m",
    successfulAttempts: 10,
    unsuccessfulAttempts: 5,
  },
  {
    id: 2,
    complete: false,
    pressesNeeded: 75,
    totalPresses: 40,
    duration: "15m",
    successfulAttempts: 3,
    unsuccessfulAttempts: 7,
  },
  {
    id: 3,
    complete: true,
    pressesNeeded: 100,
    totalPresses: 250,
    duration: "45m",
    successfulAttempts: 20,
    unsuccessfulAttempts: 10,
  },
  {
    id: 4,
    complete: false,
    pressesNeeded: 60,
    totalPresses: 30,
    duration: "10m",
    successfulAttempts: 2,
    unsuccessfulAttempts: 8,
  },
  {
    id: 5,
    complete: true,
    pressesNeeded: 80,
    totalPresses: 160,
    duration: "25m",
    successfulAttempts: 12,
    unsuccessfulAttempts: 3,
  },
];

export { Card, CardContent, Button, Drawer };