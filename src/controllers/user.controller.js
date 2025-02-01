import { asyncHandler } from "../utils/asynchandler.js"
import { ApiError } from "../utils/ApiError.js"
import { User } from "../models/user.models.js"
import { uploadOnCloudinary, deleteFromCloudinary} from "../utils/cloudinary.js";
import { ApiResponse } from "../utils/ApiResponse.js"
import jwt from "jsonwebtoken"
import mongoose from "mongoose"


const generateAccessAndRefreshToken = async (userId) => {
    try {
        const user = await User.findById(userId)
        const accesstoken = user.generateAccessToken()
        const refreshToken = user.generateRefreshToken()
    
        user.refreshToken = refreshToken;
        await user.save({validateBeforeSave: false})
    
        return { accesstoken, refreshToken };
    } catch (error) {
        throw new ApiError(500, "Something went wrong while generating access and refresh tokens")
        
    }

}

const registerUser = asyncHandler( async (req, res) => {
    // get user details from frontend
    const {username, email, fullname, password} = req.body

    // validation - not empty
    if ([fullname, email, username, password].some((field) => field.trim() === "")) {
        throw new ApiError(400, "All fields are required")
    }

    // check if user already exist: username, email
    const existedUser = await User.findOne({
        $or: [ {username}, {email} ]
    })

    if (existedUser) {
      throw new ApiError(409, "User with email or username already exists");
    }

    // check for images, check for avatar
    const avatarLocalPath = req.files?.avatar?.[0]?.path
    const coverImageLocalPath = req.files?.coverImage?.[0]?.path

    if (!avatarLocalPath) {
        throw new ApiError(400, "Avatar file is required")
    }

    //upload them to cloudinary, avatar check
    // const avatar = await uploadOnCloudinary(avatarLocalPath)
    // console.log("uploaded avatar", avatar);
    
    // let coverImage =""
    // if (coverImageLocalPath) {
    //     coverImage = await uploadOnCloudinary(coverImageLocalPath);
    //     console.log("Uploaded cover image", coverImage);
        
    // }

    // if (!avatar) {
    //     throw new ApiError(400, "Avatar file is required");    
    // }


    let avatar;
    try {
      avatar = await uploadOnCloudinary(avatarLocalPath)
      console.log("Uploaded avatar", avatar);
      
    } catch (error) {
      console.log("Error uploading avatar", error);
      throw new ApiError(500, "Failed to upload avatar");
    }

    let coverImage;
    try {
      coverImage = await uploadOnCloudinary(coverImageLocalPath);
      console.log("Uploaded coverImage", coverImage);
      
    } catch (error) {
      console.log("Error uploading coverImage", error);
      throw new ApiError(500, "Failed to upload coverImage");
    }

    // create user object - create entry in db 
    try {
      const user = await User.create({
        username: username.toLowerCase(),
        email: email,
        fullname: fullname,
        avatar: avatar.url,
        coverImage: coverImage?.url || "",
        password: password,
      });
  
      // remove password and refresh token field from response
      // check for user creation 
      const createdUser = await User.findById(user._id).select(
        "-password -refreshToken"
      );
  
      if (!createdUser) {
          throw new ApiError(500, "Something went wrong while registering the user")
      }
  
      // return res
      return res.status(201).json( new ApiResponse(200, createdUser, "User registered succesfully"))
    
      
    } 
    catch (error) {
      console.log("User creation failed");
      if (avatar) {
        await deleteFromCloudinary(avatar.public_id)
      }
      if (coverImage) {
        await deleteFromCloudinary(coverImage.public_id)
      }
       throw new ApiError(
         500,
         "Something went wrong while registering the user and images were deleted"
       );
    }
  })

const loginUser = asyncHandler( async (req, res) => {
  // get data from body, frontend
  const { email, username, password } = req.body;

  // validation
  if (!email && !password) {
    throw new ApiError(400, "Email and Password are required");
  }

  // find the user (Database Query)
  const user = await User.findOne({
    $or: [{ username }, { email }],
  });

  if (!user) {
    throw new ApiError(400, "User not found")
  }

  // validate password
  const isPasswordValid = await user.isPasswordCorrect(password)

  if (!isPasswordValid) {
    throw new ApiError(401, "Invalid user credentials")
  }
  // generate acess and refresh token 
  const { accesstoken, refreshToken } = await generateAccessAndRefreshToken(
    user._id
  );

    // get the user
  const loggedinUser = await User.findById(user._id).select( "-password -refreshToken" );

  const options = {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production", 
  };

  // send response 
  return res
    .status(200)
    .cookie("accessToken", accesstoken, options)
    .cookie("refreshToken", refreshToken, options)
    .json(
      new ApiResponse(
        200,
        { user: loggedinUser, accesstoken, refreshToken },
        "User looged in successfully"
      )
    );
})

const logoutUser = asyncHandler( async (req, res) => {
  await User.findByIdAndUpdate(
    // todo: need to comeback here after middleware
    req.user._id,   
    {
      $set:{
        refreshToken: undefined,
      }
    },
    {new: true}
  )

    const options = {
      httpOnly: true, 
      secure: process.env.NODE_ENV === "production"
    }

    return res
      .status(200)
      .clearCookie("accessToken", options)
      .clearCookie("refreshToken", options)
      .json( new ApiResponse(200, {}, "User logged out succesfully") )

})

const refreshAccessToken = asyncHandler( async (req, res) => {
  const incomingRefreshToken = req.cookies.refreshToken || req.body.refreshToken;

  if (!incomingRefreshToken) {
    throw new ApiError(401, "Refresh token is required");
  }

  try {
    const decodedToken = jwt.verify(
      incomingRefreshToken,
      process.env.REFRESH_TOKEN_SECRET
    );
    const user = await User.findById(decodedToken?._id);

    if (!user) {
      throw new ApiError(401, "Invalid refresh token");
    }

    if (incomingRefreshToken !== user?.refreshToken) {
      throw new ApiError(401, "Invalid refresh token");
    }

    const options = {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
    };

    const { accesstoken, refreshToken: newrefreshToken } = await generateAccessAndRefreshToken(user._id);
    return res
      .status(200)
      .cookie("accessToken", accesstoken, options)
      .cookie("refreshToken", newrefreshToken, options)
      .json(
        new ApiResponse(
          200,
          { accesstoken, refreshToken: newrefreshToken },
          "Access token refreshed succesfully"
        )
      );
  } catch (error) {
    throw new ApiError(
      500,
      "Something went wrong while refreshing access token"
    );
  }

})

const changeCurrentPassword = asyncHandler( async (req, res) => {
  const {oldPassword, newPassword} = req.body
  
  const user = await User.findById(req.user?._id);
  
  const isPasswordValid = await user.isPasswordCorrect(oldPassword)

  if (!isPasswordValid) {
    throw new ApiError(401, "Old password is incorrect")
  }

  user.password = newPassword

  await user.save({ validateBeforeSave: false })

  return res.status(200).json( new ApiResponse(200, {}, "Password changed successfully"))

})

const getCurrentUser = asyncHandler( async (req, res) => {
  //console.log("user: ", req.user.username);
  
  return res.status(200).json( new ApiResponse(200, req.user, "Current user details"))
})

const updateAccountDetails = asyncHandler( async (req, res) => {
  const { fullname, email } = req.body; 

  if (!fullname || !email) {
    throw new ApiError(400, "Fullname and email are required")
  }

  const user = await User.findByIdAndUpdate(
    req.user?._id,
    {
      $set:{
        fullname,
        email
      }
    },
    {new: true}
  ).select("-password -refreshToken")

  return res.status(200).json( new ApiResponse(200, user, "Account details updated succesfully"))
})

const updateUserAvatar = asyncHandler( async (req, res) => {
  const avatarLocalPath = req.file?.path

  if (!avatarLocalPath) {
    throw new ApiError(400, "File is required")
  }

  const avatar = await uploadOnCloudinary(avatarLocalPath)

  if (!avatar.url) {
    throw new ApiError(500, "Something went wrong while uploading avatar")
  }

  const user = await User.findByIdAndUpdate(
    req.user._id,
    {
      $set:{
        avatar: avatar.url
      }
    },
    {new: true}
  ).select("-password -refreshToken")

  res.status(200).json( new ApiResponse(200, user, "Avatar updated successfully"))

})

const updateUserCoverImage = asyncHandler( async (req, res) => {
  const coverImageLocalPath = req.file?.path

  if (!coverImageLocalPath) {
    throw new ApiError(400, "File is required")
  }

  const coverImage = await uploadOnCloudinary(coverImageLocalPath)

  if (!coverImage.url) {
    throw new ApiError(500, "Something went wrong while uploading coverImage");
  }

  const user = await User.findByIdAndUpdate(
    req.user._id,
    {
      $set:{
        coverImage: coverImage.url
      }
    },
    {new: true}
  ).select("-password -refreshToken")

  return res.status(200).json( new ApiResponse(200, user, "Cover image updated successfully"))
})

const getUserChannelProfile = asyncHandler( async (req, res) => {
  const {username} = req.params

  if (!username?.trim()) {
    throw new ApiError(400, "Username is required")
  }

  const channel = await User.aggregate([
    {
      $match: {
        username: username?.toLowerCase(),
      }
    },
    {
      $lookup: {
        from: "subscriptions",
        localField: "_id",
        foreignField: "channel",
        as: "subscribers",
      }
    },
    {
      $lookup: {
        from: "subscriptions",
        localField: "_id",
        foreignField: "subscriber",
        as: "subscribedTo",
      }
    },
    {
      $addFields: {
        subscribersCount: {
          $size: "$subscribers",
        },
        channelSubscribedToCount: {
          $size: "$subscribedTo",
        },
        isSubscribed: {
          $cond: {
            if: { $in: [req.user?._id, "$subscribers.subscriber"] },
            then: true,
            else: false
          },
        },
      },
    },
    {
      $project: {
        fullname: 1,
        username: 1,
        avatar: 1,
        subscribersCount: 1,
        channelSubscribedToCount: 1,
        email: 1,
        coverImage: 1,
        isSubscribed: 1,
      },
    },
  ]);


  if (!channel?.length) {
    throw new ApiError(404, "Channel not found")
  }

  return res.status(200).json( new ApiResponse( 200, channel[0] , "Channel profile fetched successfully" ))
})

const getWatchHistory = asyncHandler( async (req, res) => {
  const user = await User.aggregate([
    {
      $match: {
        _id: new mongoose.Types.ObjectId(req.user?._id),
      },
    },
    {
      $lookup: {
        from: "videos",
        localField: "watchHistory",
        foreignField: "_id",
        as: "watchHistory",
        pipeline: [
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
                    fullname: 1, 
                    avatar: 1,
                  }
                }
              ]
            }
          } , 
          {
            $addFields: {
              owner: {
                $first: "$owner"
              }
            }
          }

        ]

      },
    },
  ]);
console.log(user);

  return res.status(200).json( new ApiResponse(200, user[0]?.watchHistory, "Watch history fetched successfully"))

})


export {
  registerUser,
  loginUser,
  refreshAccessToken,
  logoutUser,
  changeCurrentPassword,
  getCurrentUser,
  updateAccountDetails,
  updateUserAvatar,
  updateUserCoverImage,
  getUserChannelProfile,
  getWatchHistory,
}
