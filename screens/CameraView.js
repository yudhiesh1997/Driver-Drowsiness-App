import React, { useState, useEffect } from "react";
import { isEmpty } from "lodash";
import { Button, Text, View } from "react-native";
import { Camera } from "expo-camera";
import * as tf from "@tensorflow/tfjs";
import * as blazeface from "@tensorflow-models/blazeface";
import "@tensorflow/tfjs-react-native";
import * as Permissions from "expo-permissions";
import {
  cameraWithTensors,
  bundleResourceIO,
  decodeJpeg
} from "@tensorflow/tfjs-react-native";

import styles from "../styles/style";
console.disableYellowBox = true;

const TensorCamera = cameraWithTensors(Camera);

export default function CameraView() {
  let requestAnimationFrameId = 0;
  let frameCount = 0;
  let makePredictionsEveryNFrames = 5;

  const AUTORENDER = true;

  const previewLeft = 40;
  const previewTop = 50;
  const previewWidth = 350;
  const previewHeight = 600;
  const tensorDims = { height: 224, width: 224, depth: 3 };

  const [hasPermission, setHasPermission] = useState(null);
  const [blazeFaceModel, setBlazeFaceModel] = useState(null);
  const [textureDimsState, setTextureDims] = useState();
  const [blazeFacePrediction, setBlazeFacePrediction] = useState();
  const [type, setType] = useState(Camera.Constants.Type.front);
  const [modelFaces, setModelFaces] = useState([]);
  const [isTFReady, setTFReady] = useState(false);
  const [loadedModel, setModelLoaded] = useState(null);
  const [modelPrediction, setModelPrediction] = useState("");
  const [predictionFound, setPredictionFound] = useState(false);
  const modelJSON = require("../model/model.json");
  const modelWeights = require("../model/group1-shard1of1.bin");

  useEffect(() => {
    if (!isTFReady) {
      (async () => {
        try {
          const { status } = await Camera.requestPermissionsAsync().catch(e =>
            console.log(e)
          );
          if (Platform.OS == "ios") {
            setTextureDims({ height: 1920, width: 1080 });
          } else {
            setTextureDims({ height: 1200, width: 1600 });
          }
          setHasPermission(status === "granted");
          await tf.ready().catch(e => console.log(e));
          setTFReady(true);
          setModelLoaded(await loadModel());
          setBlazeFaceModel(
            await loadBlazeFaceModel().catch(e => console.log(e))
          );
        } catch (e) {
          console.log("Error in 1st useEffect()");
        }
      })();
    }
  }, []);

  // Run unMount for cancelling animation if it is running to avoid leaks
  useEffect(() => {
    return () => {
      cancelAnimationFrame(requestAnimationFrameId);
    };
  }, [requestAnimationFrameId]);

  // Use the loaded model to make predictions
  // There are 3 classes that the model will be predicting
  // Class 0: Awareness levels of 0
  // Class 5: Awareness levels of 5
  // Class 10: Awareness levels of 10
  // Pick the prediction class with the highest value

  const getPrediction = async tensor => {
    if (!tensor) {
      console.log("Tensor not found!");
      return;
    }
    const model = await loadedModel;
    const bfModel = await blazeFaceModel;
    const returnTensors = true;
    const faces = await bfModel
      .estimateFaces(tensor, returnTensors)
      .catch(e => console.log(e));
    console.log(faces);
    //const tensors = Object.values(faces[0]);
    if (!isEmpty(faces)) {
      setModelFaces({ faces });
    }
    //console.log("Output at each face");
    //tensors.map(t => console.log(`Output ${t}`));

    //const prediction = model.predict(tensor.reshape([1, 224, 224, 3]));
    //if (!prediction || prediction.length === 0) {
    //  console.log("No prediction available");
    //  return;
    //}
    //// Make predictions.
    //const preds = prediction.dataSync();
    //let awareness = "";
    //preds.forEach((pred, i) => {
    //  //console.log(`x: ${i}, pred: ${pred}`);
    //  if (pred > 0.9) {
    //    if (i === 0) {
    //      awareness = "0";
    //    }
    //    if (i === 1) {
    //      awareness = "10";
    //    }
    //    if (i === 2) {
    //      awareness = "5";
    //    }
    //    console.log(`Awareness level ${awareness} Probability : ${pred}`);
    //    setModelPrediction({ prediction: pred, class_: i });
    //  }
    //});

    // Only take the predictions with a probability of 30% and greater //Stop looping
    cancelAnimationFrame(requestAnimationFrameId);
    //setPredictionFound(true);
    //setModelPrediction(prediction[0].className);
    tensor.dispose();
  };

  // Handling the camera input and converting it into tensors to be used in the
  // model for predictions
  const handleCameraStream = imageAsTensors => {
    const verbose = true;
    //console.log("Tensor input 1");
    if (!imageAsTensors) {
      console.log("Image not found!");
      return;
    }
    const loop = async () => {
      if (loadedModel !== null && blazeFaceModel !== null) {
        if (frameCount % makePredictionsEveryNFrames === 0) {
          const imageTensor = imageAsTensors.next().value;
          //console.log("Tensor input 2");
          //tf.print(imageTensor, verbose);
          await getPrediction(imageTensor).catch(e => console.log(e));
        }
      }

      frameCount += 1;
      frameCount = frameCount % makePredictionsEveryNFrames;
      requestAnimationFrameId = requestAnimationFrame(loop);
    };
    //loop infinitely to constantly make predictions
    loop();
  };
  const renderBoundingBoxes = () => {
    const { faces } = modelFaces;
    const scale = {
      height: styles.camera.height / tensorDims.height,
      width: styles.camera.width / tensorDims.width
    };
    const flipHorizontal = Platform.OS === "ios" ? false : true;
    if (!isEmpty(faces)) {
      return faces.map((face, i) => {
        const { topLeft, bottomRight } = face;
        const bbLeft = topLeft.dataSync()[0] * scale.width;
        const boxStyle = Object.assign({}, styles.bbox, {
          left: flipHorizontal
            ? previewWidth - bbLeft - previewLeft
            : bbLeft + previewLeft,
          top: topLeft.dataSync()[1] * scale.height + 20,
          width:
            (bottomRight.dataSync()[0] - topLeft.dataSync()[0]) * scale.width,
          height:
            (bottomRight.dataSync()[1] - topLeft.dataSync()[1]) * scale.height
        });

        return <View style={boxStyle}></View>;
        1;
      });
    }
  };

  const renderFacesDebugInfo = () => {
    const { faces } = modelFaces;
    if (!isEmpty(faces)) {
      return faces.map((face, i) => {
        const { topLeft, bottomRight, probability } = face;

        return (
          <Text style={styles.faceDebug} key={`faceInfo${i}`}>
            probability: {probability.dataSync()[0].toFixed(3)} | Top Left: [
            {topLeft.dataSync()[0].toFixed(1)},{" "}
            {topLeft.dataSync()[1].toFixed(1)}] | Bottom Right: [
            {bottomRight.dataSync()[0].toFixed(1)},{" "}
            {bottomRight.dataSync()[1].toFixed(1)}]
          </Text>
        );
      });
    }
  };

  const loadBlazeFaceModel = async () => {
    const model = await blazeface.load().catch(e => console.log(e));
    console.log("Loaded Blaze Face Model");
    return model;
  };

  // Load the model from the models folder
  const loadModel = async () => {
    const model = await tf
      .loadLayersModel(bundleResourceIO(modelJSON, modelWeights))
      .catch(e => console.log(e));
    console.log("Model loaded!");
    return model;
  };

  const outputPrediction = () => {
    modelPrediction.map((pred, i) => {
      console.log(`Awareness Level ${i} Probability ${pred}`);
    });
  };

  if (hasPermission === null) {
    return <View />;
  }
  if (hasPermission === false) {
    return <Text>No access to camera</Text>;
  }

  return (
    <View>
      <TensorCamera
        style={styles.camera}
        type={type}
        cameraTextureHeight={textureDimsState.height}
        cameraTextureWidth={textureDimsState.width}
        resizeHeight={tensorDims.height}
        resizeWidth={tensorDims.width}
        resizeDepth={tensorDims.depth}
        onReady={handleCameraStream}
        autorender={AUTORENDER}
      />
      {renderBoundingBoxes()}
      {renderFacesDebugInfo()}
      <View
        style={{
          flex: 1,
          backgroundColor: "transparent",
          flexDirection: "row",
          justifyContent: "center"
        }}
      >
        <View>
          <Text>
            Tensorflow.js {tf.version.tfjs} is:
            {isTFReady ? " READY" : " LOADING"}
            {isTFReady && ` and using backend: ${tf.getBackend()}`}
          </Text>
        </View>
        <View style={styles.modelButtonContainer}>
          <Button
            title="Flip Screen"
            color="black"
            style={styles.appButtonText2}
            onPress={() => {
              setType(
                type === Camera.Constants.Type.back
                  ? Camera.Constants.Type.front
                  : Camera.Constants.Type.back
              );
            }}
          />
        </View>
      </View>
    </View>
  );
}
