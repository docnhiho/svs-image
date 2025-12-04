import React, { useState, useRef, useEffect } from 'react';
import OpenSeadragon from "openseadragon";
import Loading from '../components/Loading';
import { toast } from '../components/Toast';

import { ReactComponent as PencilIcon } from '../icon/pencil-svgrepo-com.svg';
import { ReactComponent as StopIcon } from '../icon/stop-svgrepo-com.svg';
import { ReactComponent as SaveIcon } from '../icon/save-item-1411-svgrepo-com.svg';
import { ReactComponent as UndoIcon } from '../icon/undo-left-svgrepo-com.svg';
import { ReactComponent as DeleteIcon } from '../icon/delete-1487-svgrepo-com.svg';
import { ReactComponent as BookmarkIcon } from '../icon/bookmark-svgrepo-com.svg';

const Annotator = () => {
  const [annotations, setAnnotations] = useState([]);
  const annotationsRef = useRef([]);
  useEffect(() => {
    annotationsRef.current = annotations;
  }, [annotations]);

  const [annotation, setAnnotation] = useState({});
  const [dziUrl, setDziUrl] = useState(null);
  const viewerRef = useRef(null);

  const [selectedAnnotationId, setSelectedAnnotationId] = useState(null);
  const [isLoading, setLoading] = useState(false);
  const [currentFileName, setCurrentFileName] = useState(null);
  const [isDrawingMode, setIsDrawingMode] = useState(false);
  const isDrawingModeRef = useRef(false);

  useEffect(() => {
    isDrawingModeRef.current = isDrawingMode;
  }, [isDrawingMode]);

  // const [isSpacePressed, setIsSpacePressed] = useState(false);
  const isSpacePressed = false
  const isSpacePressedRef = useRef(false);

  // Thumbnails state
  const [thumbnails, setThumbnails] = useState({});

  // Function to capture thumbnail
  const captureThumbnail = (anno) => {
    if (!viewerRef.current) return null;

    const viewer = viewerRef.current;
    const canvas = viewer.drawer.canvas;

    const { x, y, width, height } = anno.geometry;

    // Convert viewport coordinates to canvas pixel coordinates
    const topLeftPoint = new OpenSeadragon.Point(x, y);
    const bottomRightPoint = new OpenSeadragon.Point(x + width, y + height);

    // Convert to viewer element (canvas) coordinates
    const topLeftPixel = viewer.viewport.viewportToViewerElementCoordinates(topLeftPoint);
    const bottomRightPixel = viewer.viewport.viewportToViewerElementCoordinates(bottomRightPoint);

    // Get canvas size ratio
    const canvasWidth = canvas.width;
    const canvasHeight = canvas.height;
    const elementWidth = viewer.element.clientWidth;
    const elementHeight = viewer.element.clientHeight;

    const scaleX = canvasWidth / elementWidth;
    const scaleY = canvasHeight / elementHeight;

    // Convert to actual canvas coordinates
    const pixelX = Math.floor(topLeftPixel.x * scaleX);
    const pixelY = Math.floor(topLeftPixel.y * scaleY);
    const pixelWidth = Math.floor((bottomRightPixel.x - topLeftPixel.x) * scaleX);
    const pixelHeight = Math.floor((bottomRightPixel.y - topLeftPixel.y) * scaleY);

    // Ensure coordinates are within canvas bounds
    const safeX = Math.max(0, Math.min(pixelX, canvasWidth));
    const safeY = Math.max(0, Math.min(pixelY, canvasHeight));
    const safeWidth = Math.min(pixelWidth, canvasWidth - safeX);
    const safeHeight = Math.min(pixelHeight, canvasHeight - safeY);

    if (safeWidth <= 0 || safeHeight <= 0) {
      console.warn('Invalid thumbnail dimensions');
      return null;
    }

    // Create a temporary canvas to extract the region
    const tempCanvas = document.createElement('canvas');
    const maxThumbnailSize = 100; // Max dimension

    // Calculate thumbnail size while preserving aspect ratio
    const aspectRatio = safeWidth / safeHeight;
    let thumbWidth, thumbHeight;

    if (aspectRatio > 1) {
      // Wider than tall
      thumbWidth = maxThumbnailSize;
      thumbHeight = maxThumbnailSize / aspectRatio;
    } else {
      // Taller than wide
      thumbHeight = maxThumbnailSize;
      thumbWidth = maxThumbnailSize * aspectRatio;
    }

    tempCanvas.width = thumbWidth;
    tempCanvas.height = thumbHeight;
    const ctx = tempCanvas.getContext('2d');

    // Fill background (optional, won't be visible if we fill completely)
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, thumbWidth, thumbHeight);

    try {
      // Draw the cropped region to fill entire canvas
      ctx.drawImage(
        canvas,
        safeX, safeY, safeWidth, safeHeight,
        0, 0, thumbWidth, thumbHeight
      );

      return tempCanvas.toDataURL('image/png');
    } catch (err) {
      console.error('Error capturing thumbnail:', err);
      return null;
    }
  };

  // -------------------------------------------------------
  // Upload .svs
  // -------------------------------------------------------
  const handleUpload = async (event) => {
    const file = event.target.files[0];
    if (!file) return;

    setLoading(true);
    setCurrentFileName(file.name);

    const formData = new FormData();
    formData.append("file", file);

    try {
      const res = await fetch("http://127.0.0.1:5000/upload", {
        method: "POST",
        body: formData
      });
      if (res.ok) {
        // alert("Annotations saved successfully!");
        toast.success("Image uploaded successfully!");
      } else {
        // alert("Failed to save annotations.");
        toast.error("Failed to upload image.");
      }

      const data = await res.json();
      setDziUrl(data.dzi_url);
    } catch (err) {
      console.error(err);
      setLoading(false);
    }
  };

  // -------------------------------------------------------
  // Save Annotations
  // -------------------------------------------------------
  const handleSave = async () => {
    if (!currentFileName || annotations.length === 0) return;

    try {
      const res = await fetch("http://127.0.0.1:5000/save_annotations", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          filename: currentFileName,
          annotations: annotations
        })
      });

      if (res.ok) {
        // alert("Annotations saved successfully!");
        toast.success("Annotations saved successfully!");
      } else {
        // alert("Failed to save annotations.");
        toast.error("Failed to save annotations.");
      }
    } catch (err) {
      console.error(err);
      alert("Error saving annotations.");
    }
  };

  // -------------------------------------------------------
  // Load Annotations
  // -------------------------------------------------------
  const handleLoad = async () => {
    if (!currentFileName) return;

    try {
      const res = await fetch(`http://127.0.0.1:5000/load_annotations?filename=${currentFileName}`);
      if (res.ok) {
        const data = await res.json();
        setAnnotations(data);

        // Generate thumbnails for loaded annotations
        setTimeout(() => {
          const newThumbnails = {};
          data.forEach((anno) => {
            const thumbnail = captureThumbnail(anno);
            if (thumbnail) {
              newThumbnails[anno.data.id] = thumbnail;
            }
          });
          setThumbnails(newThumbnails);
        }, 500); // Wait for viewer to render overlays

        toast.success("Annotations loaded successfully!");
      } else {
        toast.error("No saved annotations found for this file.");
      }
    } catch (err) {
      console.error(err);
      alert("Error loading annotations.");
    }
  };

  // -------------------------------------------------------
  // AI Detection
  // -------------------------------------------------------
  const handleAIDetect = async () => {
    if (!currentFileName) {
      toast.error("Please upload an image first");
      return;
    }

    setLoading(true);

    try {
      const res = await fetch("http://127.0.0.1:5000/predict", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          filename: currentFileName
        })
      });

      if (res.ok) {
        const data = await res.json();
        const predictions = data.predictions;

        // Add AI predictions to annotations
        setAnnotations(prev => [...prev, ...predictions]);

        // Generate thumbnails for AI predictions
        setTimeout(() => {
          const newThumbnails = {};
          predictions.forEach((pred) => {
            const thumbnail = captureThumbnail(pred);
            if (thumbnail) {
              newThumbnails[pred.data.id] = thumbnail;
            }
          });
          setThumbnails(prevThumbnails => ({
            ...prevThumbnails,
            ...newThumbnails
          }));
        }, 500);

        toast.success(`AI detected ${predictions.length} cells!`);
      } else {
        const error = await res.json();
        toast.error(`AI detection failed: ${error.error || 'Unknown error'}`);
      }
    } catch (err) {
      console.error(err);
      toast.error("Error running AI detection");
    } finally {
      setLoading(false);
    }
  };


  // -------------------------------------------------------
  // Init OpenSeadragon
  // -------------------------------------------------------
  useEffect(() => {
    if (!dziUrl) return;

    const viewer = OpenSeadragon({
      id: "osd-viewer",
      prefixUrl: "https://cdnjs.cloudflare.com/ajax/libs/openseadragon/2.4.2/images/",
      tileSources: dziUrl,
      crossOriginPolicy: "Anonymous",
      loadTilesWithAjax: true,
      ajaxWithCredentials: false,
      gestureSettingsMouse: {
        clickToZoom: false
      }
    });

    viewerRef.current = viewer;

    viewer.addHandler("open", () => {
      setLoading(false);
    });

    viewer.addHandler('canvas-click', (event) => {
      if (!event.quick) return;
      if (isDrawingModeRef.current) return;

      const vp = viewer.viewport.pointFromPixel(event.position);
      const annos = annotationsRef.current;

      let foundId = null;
      for (let i = annos.length - 1; i >= 0; i--) {
        const anno = annos[i];
        const { x, y, width, height } = anno.geometry;

        if (vp.x >= x && vp.x <= x + width && vp.y >= y && vp.y <= y + height) {
          foundId = anno.data.id;
          break;
        }
      }

      setSelectedAnnotationId(foundId);
    });

    return () => {
      viewer.destroy();
      viewerRef.current = null;
    };
  }, [dziUrl]);


  // -------------------------------------------------------
  // Drawing rectangles
  // -------------------------------------------------------
  useEffect(() => {
    if (!viewerRef.current || !isDrawingMode) return;

    const viewer = viewerRef.current;

    const mouseTracker = new OpenSeadragon.MouseTracker({
      element: viewer.canvas,

      pressHandler: (event) => {
        if (isSpacePressedRef.current) return;

        const vp = viewer.viewport.pointFromPixel(event.position);

        setAnnotation({
          geometry: { x: vp.x, y: vp.y, width: 0, height: 0 },
          selection: { mode: "DRAWING", anchorX: vp.x, anchorY: vp.y }
        });
      },

      dragHandler: (event) => {
        if (isSpacePressedRef.current) return;

        setAnnotation(prev => {
          if (!prev.selection || prev.selection.mode !== "DRAWING") return prev;

          const vp = viewer.viewport.pointFromPixel(event.position);
          const w = vp.x - prev.selection.anchorX;
          const h = vp.y - prev.selection.anchorY;

          return {
            ...prev,
            geometry: {
              x: w > 0 ? prev.selection.anchorX : vp.x,
              y: h > 0 ? prev.selection.anchorY : vp.y,
              width: Math.abs(w),
              height: Math.abs(h)
            }
          };
        });
      },

      releaseHandler: () => {
        if (isSpacePressedRef.current) return;

        setAnnotation(prev => {
          if (!prev.selection) return prev;

          const newAnno = {
            geometry: prev.geometry,
            data: { id: Math.random() }
          };

          // Capture thumbnail after a short delay to ensure canvas is rendered
          setTimeout(() => {
            const thumbnail = captureThumbnail(newAnno);
            if (thumbnail) {
              setThumbnails(prevThumbnails => ({
                ...prevThumbnails,
                [newAnno.data.id]: thumbnail
              }));
            }
          }, 100);

          setAnnotations(a => [...a, newAnno]);
          setIsDrawingMode(false);
          return {};
        });
      }
    });

    return () => mouseTracker.destroy();
  }, [isDrawingMode]);

  // -------------------------------------------------------
  // Enable / disable pan
  // -------------------------------------------------------
  useEffect(() => {
    if (!viewerRef.current) return;
    viewerRef.current.setMouseNavEnabled(!isDrawingMode || isSpacePressed);
  }, [isDrawingMode, isSpacePressed]);


  // -------------------------------------------------------
  // Render overlays
  // -------------------------------------------------------
  useEffect(() => {
    if (!viewerRef.current) return;
    const viewer = viewerRef.current;

    viewer.clearOverlays();

    annotations.forEach((anno) => {
      const el = document.createElement("div");
      el.className = "annotation-overlay";
      el.style.position = "absolute";

      // Different colors for AI predictions vs manual annotations
      const isAI = anno.data.type === 'ai_prediction';
      const isSelected = anno.data.id === selectedAnnotationId;
      const classType = anno.data.class; // "Nucleus" or "Cell"
      const classification = anno.data.classification; // HSIL, LSIL, ASC-H, ASC-US

      // Color scheme matching detectSVS.py:
      // - Nucleus: RED
      // - Cell: GREEN
      // - Selected: BLUE
      // - Manual annotation: RED
      if (isSelected) {
        el.style.border = "3px solid blue";
      } else if (isAI && classType === 'Nucleus') {
        el.style.border = "2px solid red";
      } else if (isAI && classType === 'Cell') {
        el.style.border = "2px solid green";
      } else {
        el.style.border = "2px solid red";
      }

      // Add classification label if exists
      if (classification && classType === 'Cell') {
        const label = document.createElement("div");
        label.style.position = "absolute";
        label.style.top = "-20px";
        label.style.left = "0";
        label.style.background = "rgba(0, 0, 0, 0.7)";
        label.style.color = "white";
        label.style.padding = "2px 6px";
        label.style.fontSize = "12px";
        label.style.fontWeight = "bold";
        label.style.borderRadius = "3px";
        label.style.whiteSpace = "nowrap";
        label.textContent = classification;
        el.appendChild(label);
      }

      viewer.addOverlay({
        element: el,
        location: new OpenSeadragon.Rect(
          anno.geometry.x,
          anno.geometry.y,
          anno.geometry.width,
          anno.geometry.height
        )
      });
    });

    if (annotation.geometry) {
      const el = document.createElement("div");
      el.style.position = "absolute";
      el.style.border = "2px solid red";

      viewer.addOverlay({
        element: el,
        location: new OpenSeadragon.Rect(
          annotation.geometry.x,
          annotation.geometry.y,
          annotation.geometry.width,
          annotation.geometry.height
        )
      });
    }
  }, [annotations, annotation, selectedAnnotationId]);


  // -------------------------------------------------------
  // UI
  // -------------------------------------------------------
  return (
    <div className="flex flex-col h-screen">
      <div className="p-4 bg-gray-100 border-b flex justify-between items-center">
        <h1 className="text-xl font-bold">SVS Annotator</h1>

        <div className="flex gap-3">
          <button
            onClick={() => setIsDrawingMode(!isDrawingMode)}
            className="px-4 py-2 bg-blue-500 text-white rounded"
          >
            {/* {isDrawingMode ? "Stop Drawing" : "Draw Annotation"} */}
            {isDrawingMode ? (<StopIcon className="w-5 h-5" />) : (<PencilIcon className="w-5 h-5" />)}


          </button>

          <button
            onClick={handleAIDetect}
            disabled={!currentFileName}
            className={`px-4 py-2 rounded text-white ${!currentFileName ? "bg-gray-400" : "bg-purple-600 hover:bg-purple-700"}`}
            title="AI Auto-Detect Cells"
          >
            <span className="flex items-center gap-2">
              🤖 AI Detect
            </span>
          </button>

          <button
            disabled={!selectedAnnotationId}
            onClick={() => {
              if (selectedAnnotationId) {
                setAnnotations(prev => prev.filter(a => a.data.id !== selectedAnnotationId));
                setThumbnails(prev => {
                  const newThumbnails = { ...prev };
                  delete newThumbnails[selectedAnnotationId];
                  return newThumbnails;
                });
                setSelectedAnnotationId(null);
              }
            }}
            className={`px-4 py-2 rounded text-white ${!selectedAnnotationId ? "bg-gray-400" : "bg-red-600"}`}
          >
            <DeleteIcon className="w-5 h-5" />
          </button>

          <button
            disabled={annotations.length === 0}
            onClick={() => {
              const lastAnno = annotations[annotations.length - 1];
              if (lastAnno) {
                setThumbnails(prev => {
                  const newThumbnails = { ...prev };
                  delete newThumbnails[lastAnno.data.id];
                  return newThumbnails;
                });
              }
              setAnnotations(prev => prev.slice(0, -1));
            }}
            className={`px-4 py-2 rounded text-white bg-gray-400`}
          >
            <UndoIcon className="w-5 h-5" />
          </button>

          <button
            disabled={annotations.length === 0}
            onClick={handleSave}
            className={`px-4 py-2 rounded text-white ${annotations.length === 0 ? "bg-gray-400" : "bg-green-600"}`}
          >
            <SaveIcon className="w-5 h-5" />
          </button>

          <button
            disabled={!currentFileName}
            onClick={handleLoad}
            className={`px-4 py-2 rounded text-white ${!currentFileName ? "bg-gray-400" : "bg-yellow-600"}`}
          >
            <BookmarkIcon className="w-5 h-5" />
          </button>

          {/* Classification Dropdown - Fixed Position */}
          <div className="ml-4 flex items-center gap-2 px-3 py-2 bg-gray-100 rounded">
            <label className="text-sm font-medium text-gray-700">Classify:</label>
            <select
              value={(() => {
                if (!selectedAnnotationId) return "";
                const selectedAnno = annotations.find(a => a.data.id === selectedAnnotationId);
                return selectedAnno?.data?.classification || "";
              })()}
              onChange={(e) => {
                if (selectedAnnotationId) {
                  const value = e.target.value;
                  setAnnotations(prev => prev.map(anno => {
                    if (anno.data.id === selectedAnnotationId) {
                      if (value === "") {
                        // Remove classification - create new data object without classification field
                        const newData = {
                          id: anno.data.id,
                          type: anno.data.type,
                          class: anno.data.class,
                          confidence: anno.data.confidence
                        };
                        return {
                          geometry: anno.geometry,
                          data: newData
                        };
                      } else {
                        // Set classification
                        return {
                          geometry: anno.geometry,
                          data: {
                            ...anno.data,
                            classification: value
                          }
                        };
                      }
                    }
                    return anno;
                  }));
                  if (value) {
                    toast.success(`Classified as ${value}`);
                  } else {
                    toast.success('Classification removed');
                  }
                }
              }}
              disabled={(() => {
                if (!selectedAnnotationId) return true;
                const selectedAnno = annotations.find(a => a.data.id === selectedAnnotationId);
                return selectedAnno?.data?.class !== 'Cell';
              })()}
              className={`px-3 py-1 rounded border ${!selectedAnnotationId || annotations.find(a => a.data.id === selectedAnnotationId)?.data?.class !== 'Cell'
                ? 'bg-gray-200 text-gray-400 cursor-not-allowed'
                : 'bg-white border-gray-300 hover:border-blue-500 cursor-pointer'
                }`}
            >
              <option value="">-- Select --</option>
              <option value="HSIL">HSIL</option>
              <option value="LSIL">LSIL</option>
              <option value="ASC-H">ASC-H</option>
              <option value="ASC-US">ASC-US</option>
            </select>
          </div>

          <input
            type="file"
            accept=".svs,.tif,.tiff,.jpg,.jpeg,.png,.bmp,.ndpi,.vms,.vmu,.scn"
            onChange={handleUpload}
          />

        </div>
      </div>

      <div className="flex flex-col flex-grow overflow-hidden">
        {/* Main viewer area */}
        <div className="flex-grow relative">
          {isLoading && (
            <div className="flex items-center justify-center h-full">
              <Loading />
            </div>
          )}
          {dziUrl ? (
            <div
              id="osd-viewer"
              style={{ width: "100%", height: "100%", background: "black" }}
            />
          ) : (
            !isLoading && (
              <div className="h-full flex items-center justify-center text-gray-500">
                Upload .svs to start annotating
              </div>
            )
          )}
        </div>
      </div>

      {/* Thumbnails bottom panel */}
      {annotations.length > 0 && (
        <div className="bg-gray-50 border-t p-4" style={{ height: "180px" }}>
          <h2 className="text-sm font-bold mb-2">Annotations ({annotations.length})</h2>
          <div className="flex gap-3 overflow-x-auto pb-2" style={{ height: "calc(100% - 30px)" }}>
            {annotations.map((anno, idx) => (
              <div
                key={anno.data.id}
                onClick={() => {
                  setSelectedAnnotationId(anno.data.id);

                  // Zoom and pan to the annotation
                  if (viewerRef.current) {
                    const viewer = viewerRef.current;
                    const { x, y, width, height } = anno.geometry;

                    // Calculate center point of the annotation
                    const centerX = x + width / 2;
                    const centerY = y + height / 2;

                    // Calculate zoom level to fit the annotation with some padding
                    const viewport = viewer.viewport;
                    const viewportBounds = viewport.getBounds();

                    // Zoom to show annotation with 2x padding
                    const padding = 2;
                    const targetZoom = Math.min(
                      viewportBounds.width / (width * padding),
                      viewportBounds.height / (height * padding)
                    );

                    // Pan to center and zoom
                    const center = new OpenSeadragon.Point(centerX, centerY);
                    viewport.panTo(center, true);
                    viewport.zoomTo(viewport.getZoom() * targetZoom, center, true);
                  }
                }}
                className={`flex-shrink-0 cursor-pointer border-2 rounded p-2 transition-all ${selectedAnnotationId === anno.data.id
                  ? 'border-blue-500 bg-blue-50'
                  : 'border-gray-300 hover:border-gray-400'
                  }`}
                style={{ width: "140px" }}
              >
                <div className="flex items-center justify-between mb-1">
                  <span className="font-semibold text-xs">#{idx + 1}</span>
                  {selectedAnnotationId === anno.data.id && (
                    <span className="text-xs text-blue-600 font-medium">✓</span>
                  )}
                </div>
                {thumbnails[anno.data.id] ? (
                  <img
                    src={thumbnails[anno.data.id]}
                    alt={`Annotation ${idx + 1}`}
                    className="w-full h-auto rounded border border-gray-200 mb-1"
                    style={{ maxHeight: "80px", objectFit: "contain" }}
                  />
                ) : (
                  <div className="w-full bg-gray-200 rounded flex items-center justify-center text-gray-400 text-xs mb-1" style={{ height: "80px" }}>
                    Loading...
                  </div>
                )}
                {/* <div className="text-xs text-gray-600 truncate">
                    {Math.round(anno.geometry.width * 1000)} × {Math.round(anno.geometry.height * 1000)}
                  </div> */}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>

  );
};

export default Annotator;