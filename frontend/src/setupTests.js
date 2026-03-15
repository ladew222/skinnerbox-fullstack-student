// jest-dom adds custom jest matchers for asserting on DOM nodes.
// allows you to do things like:
// expect(element).toHaveTextContent(/react/i)
// learn more: https://github.com/testing-library/jest-dom
import '@testing-library/jest-dom';

// Axios ships ESM in this project version, so Jest needs a lightweight mock.
jest.mock('axios', () => {
  const axiosMock = {
    get: jest.fn(),
    post: jest.fn(),
    put: jest.fn(),
    delete: jest.fn(),
    create: jest.fn(),
    interceptors: {
      request: {
        use: jest.fn(),
      },
    },
  };

  axiosMock.create.mockReturnValue(axiosMock);

  return {
    __esModule: true,
    default: axiosMock,
  };
});

// MUI X Charts works in the browser build, but CRA/Jest can choke on one of its
// internal vendor-module paths. Mock the chart surfaces in tests so component
// behavior stays covered without pulling the full chart runtime into Jest.
jest.mock('@mui/x-charts/BarChart', () => {
  const React = require('react');

  return {
    __esModule: true,
    BarChart: (props) =>
      React.createElement('div', {
        'data-testid': 'mui-bar-chart',
        'data-series-count': Array.isArray(props?.series) ? props.series.length : 0,
      }),
  };
});

jest.mock('@mui/x-charts/PieChart', () => {
  const React = require('react');

  return {
    __esModule: true,
    PieChart: (props) =>
      React.createElement('div', {
        'data-testid': 'mui-pie-chart',
        'data-series-count': Array.isArray(props?.series) ? props.series.length : 0,
      }),
  };
});
