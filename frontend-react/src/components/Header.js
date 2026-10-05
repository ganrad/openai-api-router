// header.js
import React from 'react';

const Header = () => {
  return (
    <header className="bg-light py-3 mb-4">
      <div className="container">
        <div className="d-flex justify-content-between align-items-center">
	  <h1 className="h3">AI Information Assistant</h1>
	  <nav>
	    <a href="#" className="me-3">Home</a>
	    <a href="#" className="me-3">About</a>
	    <a href="#">Contact</a>
	  </nav>
	</div>
      </div>
    </header>
  );
};

export default Header;
