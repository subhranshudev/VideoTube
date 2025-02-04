import mongoose from "mongoose"
import {Video} from "../models/video.models.js"
import {User} from "../models/user.models.js"
import { asyncHandler } from "../utils/asynchandler.js"
import { ApiError} from "../utils/ApiError.js"
import {ApiResponse} from "../utils/ApiResponse.js"
import { deleteFromCloudinary, uploadOnCloudinary } from "../utils/cloudinary.js"


const publishAVideo = asyncHandler( async (req, res) => {
    // get the description and title from frontEnd
    const { title, description } = req.body;
    console.log(title);
    

   // check , if not empty
   if (!title) {
     throw new ApiError(400, "Title is required");
   }
   if (!description) {
     throw new ApiError(400, "Description is required");
   }

   //get the video local file 
   const videoLocalPath = req.files?.videoFile?.[0]?.path
   const thumbnailLocalPath = req.files?.thumbnail?.[0]?.path

   //check
   if (!videoLocalPath) {
    throw new ApiError(401, "video File is required");
   }
   if (!thumbnailLocalPath) {
    throw new ApiError(401, "Thumbnail File is required");
   }

   //upload on cloudinary
   let video;
   try {
    video = await uploadOnCloudinary(videoLocalPath)
    console.log("Uploaded Video", video);
   } catch (error) {
    console.log("Error in uploading video", error);
    throw new ApiError(500, " Some error occured in uploading the video");
   }
   
   let thumbnail;
   try {
    thumbnail = await uploadOnCloudinary(thumbnailLocalPath)
    console.log("Uploaded Thumbnail", thumbnail)
   } catch (error) {
    console.log("Error in uploading thumbnail", error);
    throw new ApiError(500, "Failed to upload the thumbnail");
   }

   try {
    const videoDocument = await Video.create({
        title,
        description,
        thumbnail: thumbnail.url,
        videoFile: video.url,
        duration: video.duration,
        isPublished: false,
        owner: req.user._id
    })

    const createdVideo = await Video.findById(videoDocument._id);
    console.log(createdVideo);
    
    if (!createdVideo) {
        throw new ApiError(500, "Something went wrong while uploading the video")
    }

    return res.status(200).json( new ApiResponse(202, createdVideo, "Video created successfully"))

   } catch (error) {

    console.log("Video creation failed");
    if (video) {
        await deleteFromCloudinary(video.public_id)
    }

    if (thumbnail) {
        await deleteFromCloudinary(thumbnail.public_id)
    }

    throw new ApiError(500, "Something went wrong while uploading the video and files are deleted")
    
   }

})




export { publishAVideo };