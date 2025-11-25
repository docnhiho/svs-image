import React from 'react';
import styled from 'styled-components';

const Loader = () => {
  return (

    <StyledLoader>
      <div className="loader"></div>

    </StyledLoader>
  );
}

const StyledLoader = styled.div`
  /* HTML: <div class="loader"></div> */
.loader {
  width: 50px;
  aspect-ratio: 1;
  border-radius: 50%;
  border: 8px solid;
  border-color: #000 #0000;
  animation: l1 1s infinite;
}
@keyframes l1 {to{transform: rotate(.5turn)}}
`;

export default Loader;
