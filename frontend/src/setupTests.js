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
