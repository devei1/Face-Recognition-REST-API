const express = require("express");
const faceapi = require("face-api.js");
const mongoose = require("mongoose");
const { Canvas, Image } = require("canvas");
const canvas = require("canvas");
const fileUpload = require("express-fileupload");
faceapi.env.monkeyPatch({ Canvas, Image });

const multer = require('multer');

const app = express();

// Define storage for uploaded files
// const storage = multer.diskStorage({
//   destination: (req, file, cb) => {
//     console.log("<<<<< ",req, file);
//     cb(null, './tmp/'); // Destination folder for uploaded files
//   },
//   filename: (req, file, cb) => {
//     cb(null,file.originalname); // Rename the file to include the timestamp     Date.now() + '-' + 
//   },
// });

// Initialize Multer with the storage configuration
// const upload = multer({ storage: storage });

// app.use( upload.array("fileA", 5))

// const cpUpload = upload.fields([
//   { name: 'File1', maxCount: 1 },
//   { name: 'File2', maxCount: 8 },
//   { name: 'File3', maxCount: 8 }
// ]);


app.use( 
  fileUpload(
    {
    useTempFiles: true,
  })
);


async function LoadModels() {
  // Load the models
  // __dirname gives the root directory of the server
  await faceapi.nets.faceRecognitionNet.loadFromDisk(__dirname + "/models");
  await faceapi.nets.faceLandmark68Net.loadFromDisk(__dirname + "/models");
  await faceapi.nets.ssdMobilenetv1.loadFromDisk(__dirname + "/models");
}
LoadModels();


const faceSchema = new mongoose.Schema({
  label: {
    type: String,
    required: true,
    unique: true,
  },
  descriptions: {
    type: Array,
    required: true,
  },
});

const FaceModel = mongoose.model("Face", faceSchema);


async function uploadLabeledImages(images, label) {
  try {
    let counter = 0;
    const descriptions = [];
    // Loop through the images
    for (let i = 0; i < images.length; i++) {
      const img = await canvas.loadImage(images[i]);
      counter = (i / images.length) * 100;
      console.log(`Progress = ${counter}%`);
      // Read each face and save the face descriptions in the descriptions array
      const detections = await faceapi.detectSingleFace(img).withFaceLandmarks().withFaceDescriptor();
      descriptions.push(detections.descriptor);
    }

    // Create a new face document with the given label and save it in DB
    const createFace = new FaceModel({
      label: label,
      descriptions: descriptions,
    });
    await createFace.save();
    return true;
  } catch (error) {
    console.log(error);
    return (error);
  }
}

async function getDescriptorsFromDB(image) {
  // Get all the face data from mongodb and loop through each of them to read the data
  let faces = await FaceModel.find();
  for (i = 0; i < faces.length; i++) {
    // Change the face data descriptors from Objects to Float32Array type
    for (j = 0; j < faces[i].descriptions.length; j++) {
      faces[i].descriptions[j] = new Float32Array(Object.values(faces[i].descriptions[j]));
    }
    // Turn the DB face docs to
    faces[i] = new faceapi.LabeledFaceDescriptors(faces[i].label, faces[i].descriptions);
  }

  // Load face matcher to find the matching face
  const faceMatcher = new faceapi.FaceMatcher(faces, 0.6);

  // Read the image using canvas or other method
  const img = await canvas.loadImage(image);
  let temp = faceapi.createCanvasFromMedia(img);
  // Process the image for the model
  const displaySize = { width: img.width, height: img.height };
  faceapi.matchDimensions(temp, displaySize);

  // Find matching faces
  const detections = await faceapi.detectAllFaces(img).withFaceLandmarks().withFaceDescriptors();
  const resizedDetections = faceapi.resizeResults(detections, displaySize);
  const results = resizedDetections.map((d) => faceMatcher.findBestMatch(d.descriptor));
  console.log("results", results);
  return results;
}




app.post("/post-face", async (req,res)=>{
  console.log("LLLL ",req.files, );
  console.log(req.body.label, ">>>>> ", req.files.File.length);
    // let File1 = '/home/hp-ubuntu/Downloads/face-recognition-rest-api-master/tmp/tmp-1-1712992526325' // req.files.File1.tempFilePath;
    // let File2 = '/home/hp-ubuntu/Downloads/face-recognition-rest-api-master/tmp/tmp-1-1712992663417' // req.files.File2.tempFilePath;
    // let File3 = '/home/hp-ubuntu/Downloads/face-recognition-rest-api-master/tmp/tmp-1-1712992708328' // req.files.File3.tempFilePath;

    // let File1 =  req.files.File1.tempFilePath;
    // let File2 =  req.files.tempFilePath;
    // let File3 =  req.files.tempFilePath;

    let tempd= req.files.File.map(({tempFilePath, ...rest})=> tempFilePath)
    console.log("tempd ", tempd );
    let label = req.body.label;
    // let result = await uploadLabeledImages([File1, File2, File3], label);
    let result = await uploadLabeledImages(tempd, label);
    if(result){
        console.log('result', result);
        res.json({message:"Face data stored successfully"})
    }else{
        res.json({message:"Something went wrong, please try again."})     
    }
})

app.post("/check-face", async (req, res) => {

  const File1 = req.files.File1.tempFilePath;
  let result = await getDescriptorsFromDB(File1);
  res.json({ result });
  
});


// add your mongo key instead of the ***
mongoose
  .connect(
    "mongodb://127.0.0.1:27017/facedb",
    {
      useNewUrlParser: true,
      useUnifiedTopology: true,
      useCreateIndex: true,
    }
  )
  .then(() => {
    app.listen(process.env.PORT || 5000);
    console.log("DB connected and server us running.");
  })
  .catch((err) => {
    console.log(err);
  });