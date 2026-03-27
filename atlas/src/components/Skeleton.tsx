import './Skeleton.css'

type SkeletonProps = {
  height?: number
}

export default function Skeleton({ height = 16 }: SkeletonProps) {
  return <div className='skeleton' style={{ height }} />
}
