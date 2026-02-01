/**
 * Tests for Terms of Service page
 *
 * Tests:
 * - Page renders with correct heading and content sections
 * - Navigation links are present and correct
 * - Key legal sections are displayed
 */

import React from 'react';
import { render, screen } from '@testing-library/react';
import TermsOfServicePage from '../page';

describe('Terms of Service Page', () => {
  describe('Page Rendering', () => {
    it('renders the page title', () => {
      render(<TermsOfServicePage />);

      expect(screen.getByRole('heading', { level: 1, name: /terms of service/i })).toBeInTheDocument();
    });

    it('renders the last updated date', () => {
      render(<TermsOfServicePage />);

      expect(screen.getByText(/last updated:/i)).toBeInTheDocument();
    });

    it('renders the Code Classroom logo link to home', () => {
      render(<TermsOfServicePage />);

      const logoLink = screen.getByRole('link', { name: '' });
      // The first link (logo) should point to home
      const allLinks = screen.getAllByRole('link');
      const homeLinks = allLinks.filter(link => link.getAttribute('href') === '/');
      expect(homeLinks.length).toBeGreaterThan(0);
    });
  });

  describe('Legal Content Sections', () => {
    it('renders Acceptance of Terms section', () => {
      render(<TermsOfServicePage />);

      expect(screen.getByRole('heading', { level: 2, name: /1\. acceptance of terms/i })).toBeInTheDocument();
    });

    it('renders Description of Service section', () => {
      render(<TermsOfServicePage />);

      expect(screen.getByRole('heading', { level: 2, name: /2\. description of service/i })).toBeInTheDocument();
    });

    it('renders User Accounts section', () => {
      render(<TermsOfServicePage />);

      expect(screen.getByRole('heading', { level: 2, name: /3\. user accounts/i })).toBeInTheDocument();
    });

    it('renders Acceptable Use section', () => {
      render(<TermsOfServicePage />);

      expect(screen.getByRole('heading', { level: 2, name: /4\. acceptable use/i })).toBeInTheDocument();
    });

    it('renders Code Execution section', () => {
      render(<TermsOfServicePage />);

      expect(screen.getByRole('heading', { level: 2, name: /5\. code execution/i })).toBeInTheDocument();
    });

    it('renders Educational Use section', () => {
      render(<TermsOfServicePage />);

      expect(screen.getByRole('heading', { level: 2, name: /6\. educational use/i })).toBeInTheDocument();
    });

    it('renders Intellectual Property section', () => {
      render(<TermsOfServicePage />);

      expect(screen.getByRole('heading', { level: 2, name: /7\. intellectual property/i })).toBeInTheDocument();
    });

    it('renders Disclaimer of Warranties section', () => {
      render(<TermsOfServicePage />);

      expect(screen.getByRole('heading', { level: 2, name: /8\. disclaimer of warranties/i })).toBeInTheDocument();
    });

    it('renders Limitation of Liability section', () => {
      render(<TermsOfServicePage />);

      expect(screen.getByRole('heading', { level: 2, name: /9\. limitation of liability/i })).toBeInTheDocument();
    });

    it('renders Changes to Terms section', () => {
      render(<TermsOfServicePage />);

      expect(screen.getByRole('heading', { level: 2, name: /10\. changes to terms/i })).toBeInTheDocument();
    });

    it('renders Termination section', () => {
      render(<TermsOfServicePage />);

      expect(screen.getByRole('heading', { level: 2, name: /11\. termination/i })).toBeInTheDocument();
    });

    it('renders Contact section', () => {
      render(<TermsOfServicePage />);

      expect(screen.getByRole('heading', { level: 2, name: /12\. contact/i })).toBeInTheDocument();
    });
  });

  describe('Navigation Links', () => {
    it('renders Back to Home link', () => {
      render(<TermsOfServicePage />);

      const homeLink = screen.getByRole('link', { name: /back to home/i });
      expect(homeLink).toHaveAttribute('href', '/');
    });

    it('renders Privacy Policy link', () => {
      render(<TermsOfServicePage />);

      const privacyLink = screen.getByRole('link', { name: /privacy policy/i });
      expect(privacyLink).toHaveAttribute('href', '/privacy');
    });
  });

  describe('Content Details', () => {
    it('mentions Code Classroom as the service', () => {
      render(<TermsOfServicePage />);

      // Multiple mentions of Code Classroom in the document
      const elements = screen.getAllByText(/code classroom/i);
      expect(elements.length).toBeGreaterThan(0);
    });

    it('describes the service as an educational coding platform', () => {
      render(<TermsOfServicePage />);

      expect(screen.getByText(/educational platform that provides/i)).toBeInTheDocument();
    });

    it('mentions Python in code execution section', () => {
      render(<TermsOfServicePage />);

      expect(screen.getByText(/python standard library/i)).toBeInTheDocument();
    });

    it('includes disclaimer about service being provided as-is', () => {
      render(<TermsOfServicePage />);

      expect(screen.getByText(/provided "as is"/i)).toBeInTheDocument();
    });
  });
});
