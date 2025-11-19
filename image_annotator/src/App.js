import React, { useState } from 'react';
import Annotator from "./pages/Annotator";
import OpenSeadragonViewer from './components/OpenSeaDragonViewer';


function App() {
  const [imageFiles, setImageFiles] = useState([]);
  const [imagesPreview, setImagesPreview] = useState([]);

  return (
    <div className="App">
      <Annotator
        imageFiles={imageFiles}
        setImageFiles={setImageFiles}
        imagesPreview={imagesPreview}
        setImagesPreview={setImagesPreview}
      />
    </div>
  //   <div className="App">
  //   <OpenSeadragonViewer></OpenSeadragonViewer>
  // </div>
  );
}

export default App;
