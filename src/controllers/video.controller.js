import mongoose, { isValidObjectId } from "mongoose"
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

const getAllVideos = asyncHandler( async (req, res) => {
  // get data from url query( /?key=value)
  let { page = 1, limit = 10, query, sortBy, sortType, userId } = req.query;
  //console.log(query);

  // aggregate videos based on the expressions given in query which match with the any expression of title or description of video, then sort them
  // Here during aggregation pipeline we are not using await, because during doing pagination using mongoose-aggregate-paginate it
  // requires aggregation pipeline. If we use await during aggregation it will return an Array instead of aggregation pipeline
  let aggregateVideos;
  if (query) {
    aggregateVideos = Video.aggregate([
      {
        $match: {
          $or: [
            { title: { $regex: query, $options: "i" } },
            { description: { $regex: query, $options: "i" } },
          ],
        },
      },
      {
        $sort: {
          [sortBy]: sortType === "descending" ? -1 : 1,
        },
      },
    ]);
  }

  // Anything that comes in url is in the form of string. But the page and limit should be number. 
  // So parse them using "parseInt(valueTobeParsed, radix)"  radix means base of number. Here "10" means decimal
  const pageNumber = parseInt(page, 10);
  const limitNumber = parseInt(limit, 10);
  //console.log("page", typeof(pageNumber));
  //console.log("limit", typeof(limitNumber));

  const options = {
    page: pageNumber,
    limit: limitNumber,
  };

  //Pagination 
  const video = await Video.aggregatePaginate(aggregateVideos, options);
  console.log("videos: ", video);

// check if there is any video or not
  if (video.totalDocs === 0) {
    throw new ApiError(404, "No videos found");
  }

  return res
    .status(200)
    .json(new ApiResponse(200, video.docs, "Video fetched successfully"));
})

const getVideoById = asyncHandler( async (req, res) => {
  // get the video id from url
  const { videoId } = req.params
  console.log(videoId);
  
// check the id is valid or not
  if (!isValidObjectId(videoId)) {
    throw new ApiError(400, "No videos found");
  }

  const video = await Video.aggregate([
    {
      $match: {
        _id: new mongoose.Types.ObjectId(videoId),
      },
    },
    {
      $lookup: {
        from: "users",
        localField: "owner",
        foreignField: "_id",
        as: "owner",
        pipeline: [
          {
            $project: {
              username: 1,
              avatar: 1,
            },
          },
        ],
      },
    },
    {
      $addFields: {
        owner: {
          $first: "$owner",
        },
      },
    },
  ]);
  console.log(video);
  //check there is any videdo or not
  if (video.length === 0) {
    throw new ApiError(400, "No videos found based on your search")
  }


// add the video id into the watchHistory of user
  await User.findByIdAndUpdate(
    req.user?._id,
    {
      $addToSet: {
        watchHistory: videoId
      },
    },
    { new: true }
  );

  // Increase the view count of video
  await Video.findByIdAndUpdate(
    videoId,
    {
      $inc: {
        views: 1
      },
    },
  {new: true}
  );


  return res.status(200).json(new ApiResponse(200, video[0], "Video fetched succesfully"));
})

const updateVideo = asyncHandler( async (req, res) => {
  //get video id from url
  const { videoId } = req.params
  console.log(videoId);
  
  // check id is valid or not
  if (!isValidObjectId(videoId)) {
    throw new ApiError(400, "Error in searching video")
  }

  // find the video
  const video = await Video.findById(videoId)
  if (!video) {
    throw new ApiError(404, "Video not found")
  }

  // Check the user is the owner of video or not
  if (req.user?._id.toString() !== video?.owner.toString()) {
    throw new ApiError(400, "Only the owner can update the video")
  }

  // get data 
  const { title, description } = req.body;
  if (!title && !description ) {
    throw new ApiError(400, "title and description are required")
  }
  console.log(title);
  

  const thumbnailLocalPath = req.file?.path

  let thumbnail;
  if (thumbnailLocalPath) {
       thumbnail = await uploadOnCloudinary(thumbnailLocalPath);
       if (!thumbnail) {
        throw new ApiError(500, "Something went wrong while uploading thumbnail")
       }
  }

console.log(thumbnail);


  const newVideo = await Video.findByIdAndUpdate(
    videoId,
    {
      $set:{
        title,
        description,
        thumbnail: thumbnail?.url
      }
    },
    {new:true}
  )
  console.log(newVideo);
  

  return res.status(200).json( new ApiResponse(200, newVideo, "Video updated successsfully"))
})

const deleteVideo = asyncHandler( async (req, res) => {
  const { videoId } = req.params

  if (!isValidObjectId(videoId)) {
    throw new ApiError(401, "Invalid Search")
  }

  const video = await Video.findById(videoId)

  if (!video) {
    throw new ApiError(404, "Video not found")
  }

  if (video?.owner.toString() !== req.user?._id.toString()) {
    throw new ApiError(400, "Only owner can delete the video")
  }

  await Video.findByIdAndDelete(video._id)

  return res.status(200).json( new ApiResponse(201, {}, "Video deleted successfully"))

})

const togglePublishStatus = asyncHandler( async (req, res) => {
  const { videoId } = req.params
  if (!isValidObjectId(videoId)) {
    throw new ApiError(400, "Invalid search")
  }

  const video = await Video.findById(videoId)
  if (!video) {
    throw new ApiError(404, "Video not found")
  }

  if (video?.owner.toString() !== req.user?._id.toString()) {
    throw new ApiError(400, "Unauthorized")
  }

  const newVideo = await Video.findByIdAndUpdate(
    video?._id, 
    {
      $set: {
        isPublished: !video.isPublished
      },
    },
    { new: true }
  );

  return res.status(200).json( new ApiResponse(200, newVideo, "publish status updated"))
})


export {
  publishAVideo,
  getAllVideos,
  getVideoById,
  updateVideo,
  deleteVideo,
  togglePublishStatus,
};